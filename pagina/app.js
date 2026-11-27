// Interfaz web: muestra datos y envía predicciones al servidor escrito en Python.
const $ = (selector) => document.querySelector(selector)
const modelLabels = {
  naiveBayes: 'Naive Bayes',
  randomForest: 'Random Forest',
}
const number = new Intl.NumberFormat('es-MX')
const pct = (value) => (value * 100).toFixed(1) + '%'
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
let predictionRequest = 0

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

async function renderPrediction(matches) {
  // Envía los equipos y el modelo seleccionado a Python; la interfaz solo presenta la respuesta.
  const homeName = $('#home-team').value
  const awayName = $('#away-team').value
  const key = $('#model-choice').value
  const requestNumber = ++predictionRequest
  const error = $('#prediction-error')
  const output = $('#prediction-output')
  error.hidden = true; output.replaceChildren()
  if (!homeName || !awayName || homeName === awayName) {
    error.textContent = 'Elige dos equipos distintos.'; error.hidden = false; return
  }
  output.append(element('p', 'small-note', 'El servidor Python está calculando la predicción…'))
  try {
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home: homeName, away: awayName, model: key }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'No se pudo calcular la predicción.')
    if (requestNumber !== predictionRequest) return

    output.replaceChildren()
    const forecast = element('h3', 'prediction-title', 'Resultado más probable: ' + result.predicted + ' · ' + modelLabels[key])
    output.append(forecast)
    const cards = element('div', 'prediction-grid')
    const labels = ['Gana ' + homeName, 'Empate', 'Gana ' + awayName]
    result.probabilities.forEach((probability, index) => {
      const card = element('div', 'prediction-card')
      card.append(element('strong', '', pct(probability)), element('span', '', labels[index]))
      const track = element('div', 'bar-track'); const fill = element('div', 'bar-fill')
      fill.style.width = (probability * 100) + '%'; track.append(fill); card.append(track)
      // Conversión matemática simple: momio justo decimal = 1 / probabilidad; no es una cuota de mercado.
      card.append(element('span', '', 'Momio decimal teórico: ' + (probability > 0 ? (1 / probability).toFixed(2) : '—')))
      cards.append(card)
    })
    output.append(cards)
    const importance = $('#importance-list'); importance.replaceChildren()
    for (const item of [...result.importance].sort((a, b) => b.value - a.value).slice(0, 6)) {
      addBar(importance, item.name, item.value, pct(item.value))
    }
    const explanation = $('#model-explanation'); explanation.replaceChildren()
    explanation.append(element('strong', '', 'Cómo leer esta predicción'))
    if (key === 'naiveBayes') {
      explanation.append(element('p', '', 'Naive Bayes combina las probabilidades previas de Local, Empate y Visitante con la distribución histórica de las variables. Supone independencia condicional entre variables.'))
      explanation.append(element('p', '', 'Señales que más distinguen el resultado sugerido: ' + result.explanation.map((item) => item.name + (item.impact >= 0 ? ' (+)' : ' (−)')).join('; ') + '.'))
    } else {
      explanation.append(element('p', '', 'Random Forest promedia las probabilidades de ' + result.treeCount + ' árboles internos. Cada árbol se entrena con una muestra aleatoria y considera subconjuntos distintos de variables.'))
      explanation.append(element('p', '', 'Las barras muestran la importancia global de variables del bosque, calculada con reducción de impureza Gini.'))
    }
    explanation.append(element('p', '', 'Cada porcentaje es una estimación del modelo; el momio decimal es 1 / probabilidad y no incluye margen de una casa de apuestas. No es garantía ni recomendación de apuesta.'))
    renderTeamHistory(matches, homeName, awayName)
  } catch (problem) {
    if (requestNumber !== predictionRequest) return
    output.replaceChildren()
    error.textContent = problem.message
    error.hidden = false
  }
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

function renderMetrics(metrics, validationNote) {
  // La API Python calcula las métricas antes de abrir la página; aquí solo se muestran.
  const tbody = $('#metrics-table')
  for (const item of metrics) {
    const row = element('tr')
    for (const value of [item.name, pct(item.accuracy), item.logLoss.toFixed(3), item.brier.toFixed(3)]) row.append(element('td', '', value))
    tbody.append(row)
  }
  $('#validation-note').textContent = validationNote
}

async function start() {
  try {
    // Python carga el CSV, entrena los modelos y devuelve datos, métricas y nombres de variables.
    const response = await fetch('/api/dashboard')
    if (!response.ok) throw new Error('No se pudo conectar con el servidor Python (' + response.status + ').')
    const dashboard = await response.json()
    const matches = dashboard.matches
    if (!matches.length) throw new Error('El archivo no contiene partidos válidos.')
    renderOverview(matches)
    fillTeamSelectors(matches)
    renderMetrics(dashboard.metrics, dashboard.validationNote)
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
    $('#model-choice').addEventListener('change', () => renderPrediction(matches))
    $('#predict-button').addEventListener('click', () => renderPrediction(matches))
    $('#home-team').addEventListener('change', () => renderPrediction(matches))
    $('#away-team').addEventListener('change', () => renderPrediction(matches))
    $('#loading').hidden = true
    $('#app').hidden = false
    renderPrediction(matches)
  } catch (error) {
    $('#loading').hidden = true
    $('#error').textContent = error.message + ' Inicia el proyecto con python pagina/server.py desde la raíz.'
    $('#error').hidden = false
  }
}

start()
