// Interfaz web del prototipo: importa funciones de modelos.js y conecta datos, controles y resultados.
import {
  FEATURES,
  RESULT_CLASSES,
  buildExamples,
  evaluate,
  explainNaiveBayes,
  explainTree,
  fitDecisionTree,
  fitNaiveBayes,
  fitRandomForest,
  predict,
  upcomingFeatures,
} from './models.js'

const $ = (selector) => document.querySelector(selector)
// Tabla de funciones para que el selector de la interfaz pueda entrenar/usar el algoritmo elegido.
const modelFactories = {
  naiveBayes: fitNaiveBayes,
  decisionTree: fitDecisionTree,
  randomForest: fitRandomForest,
}
const modelLabels = {
  naiveBayes: 'Naive Bayes',
  decisionTree: 'Árbol de decisión',
  randomForest: 'Random Forest',
}
const number = new Intl.NumberFormat('es-MX')
const pct = (value) => (value * 100).toFixed(1) + '%'
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

// Lee CSV respetando comillas; nombres con comas no rompen las columnas del archivo.
function parseCsv(text) {
  const rows = []
  let row = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift().map((value) => value.trim())
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderOverview(matches) {
  // Cuenta partidos, equipos, goles, resultados 1X2 y victorias para el resumen histórico.
  const teams = new Set()
  const wins = new Map()
  let homeWins = 0; let draws = 0; let awayWins = 0; let goals = 0
  for (const match of matches) {
    teams.add(match.home_team); teams.add(match.away_team)
    goals += match.home_goals + match.away_goals
    if (match.home_goals > match.away_goals) { homeWins += 1; wins.set(match.home_team, (wins.get(match.home_team) ?? 0) + 1) }
    else if (match.home_goals < match.away_goals) { awayWins += 1; wins.set(match.away_team, (wins.get(match.away_team) ?? 0) + 1) }
    else draws += 1
  }
  const seasons = [...new Set(matches.map((match) => match.season))].sort()
  const first = matches[0]?.date ?? '—'
  const last = matches[matches.length - 1]?.date ?? '—'
  const cards = [
    [number.format(matches.length), 'partidos históricos'],
    [number.format(teams.size), 'clubes distintos'],
    [number.format(seasons.length), 'temporadas'],
    [average(matches.map((match) => match.home_goals + match.away_goals)).toFixed(2), 'goles por partido'],
  ]
  const numberRow = $('#overview-numbers')
  for (const [value, label] of cards) {
    const item = element('div', 'number-item')
    item.append(element('strong', '', value), element('span', '', label))
    numberRow.append(item)
  }
  const outcomes = [
    ['Victoria local', homeWins], ['Empate', draws], ['Victoria visitante', awayWins],
  ]
  for (const [label, value] of outcomes) addBar($('#historical-outcomes'), label, value / matches.length, number.format(value) + ' · ' + pct(value / matches.length))
  const top = [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)
  for (const [team, count] of top) {
    const li = element('li', '', team + ' — ' + number.format(count) + ' victorias')
    $('#top-clubs').append(li)
  }
  $('#data-source-note').textContent = 'Cobertura: temporadas ' + seasons[0] + ' a ' + seasons.at(-1) + ' (' + first + ' a ' + last + '). El CSV reúne dos fuentes; consulta “Fuentes y cobertura”. La temporada actual 2026–27 no está incluida.'
}

function addBar(container, label, proportion, valueLabel) {
  const row = element('div', 'bar-row')
  const name = element('span', 'bar-label', label)
  const track = element('div', 'bar-track')
  const fill = element('div', 'bar-fill')
  fill.style.width = Math.max(0, Math.min(proportion * 100, 100)) + '%'
  track.append(fill)
  row.append(name, track, element('span', 'bar-value', valueLabel))
  container.append(row)
}

function fillTeamSelectors(matches) {
  // Llena los menús a partir de los clubes que realmente aparecen en el archivo de Champions.
  const teams = [...new Set(matches.flatMap((match) => [match.home_team, match.away_team]))].sort((a, b) => a.localeCompare(b, 'es'))
  for (const selector of [$('#home-team'), $('#away-team')]) {
    for (const team of teams) {
      const option = element('option', '', team)
      option.value = team
      selector.append(option)
    }
  }
  const findTeam = (text) => teams.find((team) => team.toLowerCase().includes(text.toLowerCase()))
  $('#home-team').value = findTeam('real madrid') ?? teams[0]
  $('#away-team').value = findTeam('bayern') ?? teams.find((team) => team !== $('#home-team').value) ?? teams[1]
}

function renderPrediction(matches, models) {
  // Toma los equipos y modelo elegidos, calcula características, muestra probabilidades y explicación.
  const homeName = $('#home-team').value
  const awayName = $('#away-team').value
  const key = $('#model-choice').value
  const error = $('#prediction-error')
  const output = $('#prediction-output')
  error.hidden = true; output.replaceChildren()
  if (!homeName || !awayName || homeName === awayName) {
    error.textContent = 'Elige dos equipos distintos.'; error.hidden = false; return
  }
  let features
  try { features = upcomingFeatures(matches, homeName, awayName) }
  catch (problem) { error.textContent = problem.message; error.hidden = false; return }
  const model = models[key]
  const probabilities = predict(model, features)
  const winnerIndex = probabilities.indexOf(Math.max(...probabilities))
  const forecast = element('h3', 'prediction-title', 'Resultado más probable: ' + RESULT_CLASSES[winnerIndex] + ' · ' + modelLabels[key])
  output.append(forecast)
  const cards = element('div', 'prediction-grid')
  const labels = ['Gana ' + homeName, 'Empate', 'Gana ' + awayName]
  probabilities.forEach((probability, index) => {
    const card = element('div', 'prediction-card')
    card.append(element('strong', '', pct(probability)), element('span', '', labels[index]))
    const track = element('div', 'bar-track'); const fill = element('div', 'bar-fill')
    fill.style.width = (probability * 100) + '%'; track.append(fill); card.append(track)
    // Conversión matemática simple: momio justo decimal = 1 / probabilidad; no es una cuota de mercado.
    card.append(element('span', '', 'Momio decimal teórico: ' + (probability > 0 ? (1 / probability).toFixed(2) : '—')))
    cards.append(card)
  })
  output.append(cards)
  const sortedImportance = model.importance.map((value, index) => ({ name: FEATURES[index], value })).sort((a, b) => b.value - a.value)
  const importance = $('#importance-list'); importance.replaceChildren()
  for (const item of sortedImportance.slice(0, 6)) addBar(importance, item.name, item.value, pct(item.value))
  const explanation = $('#model-explanation'); explanation.replaceChildren()
  explanation.append(element('strong', '', 'Cómo leer esta predicción'))
  if (key === 'naiveBayes') {
    explanation.append(element('p', '', 'Naive Bayes calcula la probabilidad de cada resultado a partir de los promedios y la dispersión de las variables en partidos históricos. Supone que las variables son independientes entre sí.'))
    const factors = explainNaiveBayes(model, features, winnerIndex)
    explanation.append(element('p', '', 'Señales que más distinguen la clase sugerida: ' + factors.map((item) => item.name + (item.impact >= 0 ? ' (+)' : ' (−)')).join('; ') + '.'))
  } else if (key === 'decisionTree') {
    explanation.append(element('p', '', 'El árbol hace preguntas sucesivas sobre las variables. La ruta de este caso fue:'))
    const path = explainTree(model, features)
    explanation.append(element('p', '', path.length ? path.map((step, index) => (index + 1) + '. ' + step).join(' → ') : 'El árbol llegó directamente a una hoja.'))
  } else {
    explanation.append(element('p', '', 'Random Forest promedia los votos de ' + model.treeCount + ' árboles entrenados con muestras y subconjuntos de variables distintos. Las barras muestran la importancia global del bosque.'))
  }
  explanation.append(element('p', '', 'Cada porcentaje es una estimación del modelo; el momio decimal es 1 / probabilidad y no incluye margen de una casa de apuestas. No es garantía ni recomendación de apuesta.'))
  renderTeamHistory(matches, homeName, awayName)
}

function teamRecord(matches, team) {
  const own = matches.filter((match) => match.home_team === team || match.away_team === team).slice(-5)
  let wins = 0; let draws = 0; let losses = 0; let points = 0
  for (const match of own) {
    const isHome = match.home_team === team
    const gf = isHome ? match.home_goals : match.away_goals
    const ga = isHome ? match.away_goals : match.home_goals
    if (gf > ga) { wins += 1; points += 3 }
    else if (gf === ga) { draws += 1; points += 1 }
    else losses += 1
  }
  return { own, wins, draws, losses, points }
}

function renderTeamHistory(matches, homeName, awayName) {
  // Resume los últimos cinco juegos y muestra hasta cinco duelos directos de los clubes elegidos.
  const form = $('#team-form'); form.replaceChildren()
  for (const team of [homeName, awayName]) {
    const record = teamRecord(matches, team)
    const card = element('div', 'form-card')
    card.append(element('h3', '', team), element('p', '', 'Últimos cinco resultados: ' + record.wins + ' ganados · ' + record.draws + ' empatados · ' + record.losses + ' perdidos.'), element('p', '', 'Puntos sumados: ' + record.points + ' de ' + record.own.length * 3 + '.'))
    form.append(card)
  }
  const direct = matches.filter((match) => (match.home_team === homeName && match.away_team === awayName) || (match.home_team === awayName && match.away_team === homeName)).slice(-5).reverse()
  const tbody = $('#head-to-head'); tbody.replaceChildren()
  if (!direct.length) {
    const row = element('tr'); const cell = element('td', '', 'No hay enfrentamientos directos en el archivo.'); cell.colSpan = 5; row.append(cell); tbody.append(row)
  }
  for (const match of direct) {
    const row = element('tr')
    for (const value of [formatDate(match.date), match.home_team, match.home_goals + '–' + match.away_goals, match.away_team, match.season]) row.append(element('td', '', value))
    tbody.append(row)
  }
}

function formatDate(value) {
  const date = new Date(value + 'T12:00:00')
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date)
}

function renderMetrics(rows, splitIndex) {
  // Entrena tres modelos solo con el bloque antiguo y compara sus resultados en el bloque posterior.
  const trainRows = rows.slice(0, splitIndex)
  const testRows = rows.slice(splitIndex)
  const factories = [
    ['Naive Bayes', fitNaiveBayes],
    ['Árbol de decisión', fitDecisionTree],
    ['Random Forest', fitRandomForest],
  ]
  const tbody = $('#metrics-table')
  for (const [name, factory] of factories) {
    const model = factory(trainRows)
    const metrics = evaluate(model, testRows)
    const row = element('tr')
    for (const value of [name, pct(metrics.accuracy), metrics.logLoss.toFixed(3), metrics.brier.toFixed(3)]) row.append(element('td', '', value))
    tbody.append(row)
  }
  $('#validation-note').textContent = 'Entrenamiento: ' + number.format(trainRows.length) + ' partidos hasta ' + trainRows.at(-1).date + '. Evaluación: ' + number.format(testRows.length) + ' partidos posteriores, del ' + testRows[0].date + ' al ' + testRows.at(-1).date + '. La separación es cronológica para simular el uso de datos pasados al predecir el futuro.'
}

// Mantiene juntas las filas de una misma fecha para no partir una jornada entre train y test.
function temporalSplitIndex(rows) {
  let cut = Math.max(1, Math.floor(rows.length * 0.8))
  const boundaryDate = rows[cut]?.date
  while (cut > 1 && rows[cut - 1]?.date === boundaryDate) cut -= 1
  return cut
}

async function start() {
  try {
    // La web sirve los mismos datos que procesa la terminal, desde el CSV incluido en el proyecto.
    const response = await fetch('/data/champions_matches.csv')
    if (!response.ok) throw new Error('No se pudo abrir el CSV histórico (' + response.status + ').')
    const matches = parseCsv(await response.text()).map((row) => ({
      ...row,
      home_goals: Number(row.home_goals),
      away_goals: Number(row.away_goals),
    // Guarda de alcance: si una fila no está etiquetada como Champions/Copa de Europa, se excluye.
    })).filter((row) => row.competition === 'UEFA Champions League / Copa de Europa' && row.home_team && row.away_team && Number.isFinite(row.home_goals) && Number.isFinite(row.away_goals)).sort((a, b) => a.date.localeCompare(b.date))
    if (!matches.length) throw new Error('El archivo no contiene partidos válidos.')
    renderOverview(matches)
    fillTeamSelectors(matches)
    const { examples } = buildExamples(matches)
    if (examples.length < 20) throw new Error('No hay suficientes partidos con historial previo para entrenar los modelos.')
    const splitIndex = temporalSplitIndex(examples)
    renderMetrics(examples, splitIndex)
    // La tabla de métricas usa train/test; la predicción interactiva reajusta con el historial completo.
    const models = Object.fromEntries(Object.entries(modelFactories).map(([key, factory]) => [key, factory(examples)]))
    // La primera carga abre la versión fácil para exponer; el botón deja volver al tablero completo.
    const modeButton = $('#mode-toggle')
    let simpleMode = true
    const updateMode = () => {
      document.body.classList.toggle('simple-mode', simpleMode)
      modeButton.textContent = simpleMode ? 'Mostrar todo el proyecto' : 'Volver al modo sencillo'
      modeButton.setAttribute('aria-pressed', String(simpleMode))
      $('#mode-title').textContent = simpleMode ? 'Modo sencillo de exposición' : 'Modo completo del proyecto'
      $('#mode-description').textContent = simpleMode
        ? 'Resumen de Champions, predicción y explicación de variables.'
        : 'Incluye forma reciente, duelos directos, métricas y siguientes pasos.'
    }
    modeButton.addEventListener('click', () => { simpleMode = !simpleMode; updateMode() })
    updateMode()
    $('#model-choice').addEventListener('change', () => renderPrediction(matches, models))
    $('#predict-button').addEventListener('click', () => renderPrediction(matches, models))
    $('#home-team').addEventListener('change', () => renderPrediction(matches, models))
    $('#away-team').addEventListener('change', () => renderPrediction(matches, models))
    $('#loading').hidden = true
    $('#app').hidden = false
    renderPrediction(matches, models)
  } catch (error) {
    $('#loading').hidden = true
    $('#error').textContent = error.message + ' Ejecuta el proyecto con npm start desde la carpeta del proyecto.'
    $('#error').hidden = false
  }
}

start()
