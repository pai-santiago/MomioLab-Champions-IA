// Demostración de terminal para presentar el modelo desde VS Code.
// Muestra el camino completo: cargar Champions -> crear variables -> entrenar -> estimar -> explicar.
import { readFile } from 'node:fs/promises'
import {
  FEATURES, RESULT_CLASSES, buildExamples, explainNaiveBayes, explainTree,
  fitDecisionTree, fitNaiveBayes, fitRandomForest, predict, upcomingFeatures,
} from './models.js'

// Argumentos: equipo local, equipo visitante y algoritmo (naiveBayes, decisionTree o randomForest).
const [homeName, awayName, algorithm = 'naiveBayes'] = process.argv.slice(2)
const algorithms = {
  naiveBayes: fitNaiveBayes,
  decisionTree: fitDecisionTree,
  randomForest: fitRandomForest,
}
if (!algorithms[algorithm]) {
  console.log('Algoritmo válido: naiveBayes, decisionTree o randomForest.')
  process.exit(1)
}

function parseCsv(text) {
  // Parser CSV local: permite mantener el proyecto sin paquetes externos.
  const rows = []; let row = []; let cell = ''; let quoted = false
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

const csv = await readFile(new URL('./data/champions_matches.csv', import.meta.url), 'utf8')
// La columna competition funciona como una segunda guarda para excluir otros torneos.
const matches = parseCsv(csv).map((row) => ({ ...row, home_goals: Number(row.home_goals), away_goals: Number(row.away_goals) })).filter((row) => row.competition === 'UEFA Champions League / Copa de Europa' && row.home_team && row.away_team && Number.isFinite(row.home_goals) && Number.isFinite(row.away_goals)).sort((a, b) => a.date.localeCompare(b.date))
const { examples } = buildExamples(matches)
// El selector de argumentos determina cuál de los tres algoritmos se ajusta a estos ejemplos.
const model = algorithms[algorithm](examples)

console.log('\nMOMIOLAB · ANÁLISIS DE CHAMPIONS LEAGUE')
console.log('Partidos históricos leídos: ' + matches.length + ' | ejemplos con forma previa: ' + examples.length)
console.log('Algoritmo: ' + model.name)
console.log('Idea: usar la forma de los equipos y sus enfrentamientos previos para estimar Local / Empate / Visitante.')

if (homeName && awayName) {
  const features = upcomingFeatures(matches, homeName, awayName)
  const probabilities = predict(model, features)
  const bestIndex = probabilities.indexOf(Math.max(...probabilities))
  console.log('\nPartido de ejemplo: ' + homeName + ' vs ' + awayName)
  RESULT_CLASSES.forEach((result, index) => console.log('  ' + result.padEnd(10) + (probabilities[index] * 100).toFixed(1) + '%'))
  console.log('Resultado con mayor probabilidad: ' + RESULT_CLASSES[bestIndex])
  console.log('\nVariables más importantes (estimación del modelo):')
  model.importance.map((value, index) => ({ name: FEATURES[index], value })).sort((a, b) => b.value - a.value).slice(0, 5).forEach((item) => console.log('  ' + (item.value * 100).toFixed(1) + '%  ' + item.name))
  if (algorithm === 'decisionTree') console.log('\nRuta de preguntas: ' + (explainTree(model, features).join(' → ') || 'hoja inicial'))
  if (algorithm === 'naiveBayes') console.log('\nNaive Bayes compara la densidad de las variables con el patrón histórico de cada resultado.')
  if (algorithm === 'randomForest') console.log('\nRandom Forest promedia las predicciones de ' + model.treeCount + ' árboles.')
} else {
  console.log('\nFalta indicar los equipos. Ejemplo: npm run demo -- "Real Madrid CF" "FC Bayern München" ' + algorithm)
}
console.log('\nAviso: las probabilidades son estimaciones académicas basadas en resultados pasados; no garantizan un resultado.')
