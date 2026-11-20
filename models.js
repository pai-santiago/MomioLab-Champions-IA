// =============================================
// MODELOS DE MOMIOLAB: CHAMPIONS LEAGUE
// Este archivo concentra la preparación de características, el entrenamiento,
// la predicción y la evaluación de los tres modelos del prototipo.
// Cada ejemplo tiene la forma { features: [12 números], target: 'Local|Empate|Visitante' }.
// =============================================

export const RESULT_CLASSES = ['Local', 'Empate', 'Visitante']
export const FEATURES = [
  'Puntos recientes del local (5 partidos)',
  'Puntos recientes del visitante (5 partidos)',
  'Goles a favor del local (5 partidos)',
  'Goles en contra del local (5 partidos)',
  'Goles a favor del visitante (5 partidos)',
  'Goles en contra del visitante (5 partidos)',
  'Diferencia de goles reciente del local',
  'Diferencia de goles reciente del visitante',
  'Victorias recientes del local (5 partidos)',
  'Victorias recientes del visitante (5 partidos)',
  'Puntos en enfrentamientos directos (local - visitante)',
  'Goles en enfrentamientos directos (local - visitante)',
]

const CLASS_COUNT = RESULT_CLASSES.length
const FEATURE_COUNT = FEATURES.length
// Convierte el marcador final al índice común usado por todos los modelos: 0 local, 1 empate, 2 visitante.
const resultIndex = (home, away) => home > away ? 0 : home === away ? 1 : 2
// Evita tomar log(0) al calcular log-probabilidades.
const clampProbability = (value) => Math.max(1e-12, value)

// Resume solo los cinco encuentros más recientes del club antes de una fecha.
// Los puntos siguen el sistema habitual de fútbol: 3 por victoria, 1 por empate, 0 por derrota.
function summarizeTeam(history) {
  const recent = history.slice(-5)
  const n = Math.max(recent.length, 1)
  return {
    points: recent.reduce((sum, game) => sum + game.points, 0) / n,
    goalsFor: recent.reduce((sum, game) => sum + game.gf, 0) / n,
    goalsAgainst: recent.reduce((sum, game) => sum + game.ga, 0) / n,
    goalDifference: recent.reduce((sum, game) => sum + game.gf - game.ga, 0) / n,
    wins: recent.filter((game) => game.points === 3).length / n,
  }
}

// Convierte la historia anterior de dos clubes en un vector numérico de 12 variables.
// El orden de este vector debe coincidir exactamente con el arreglo FEATURES de arriba.
function makeFeatures(homeHistory, awayHistory, headToHead) {
  const home = summarizeTeam(homeHistory)
  const away = summarizeTeam(awayHistory)
  const meetings = headToHead.slice(-5)
  let homeH2hPoints = 0
  let awayH2hPoints = 0
  let homeH2hGoals = 0
  let awayH2hGoals = 0
  for (const match of meetings) {
    const isHome = match.home_team === match.homePerspective
    const localGoals = isHome ? match.home_goals : match.away_goals
    const visitorGoals = isHome ? match.away_goals : match.home_goals
    homeH2hGoals += localGoals
    awayH2hGoals += visitorGoals
    const result = resultIndex(localGoals, visitorGoals)
    if (result === 0) homeH2hPoints += 3
    if (result === 1) { homeH2hPoints += 1; awayH2hPoints += 1 }
    if (result === 2) awayH2hPoints += 3
  }
  const h2hCount = Math.max(meetings.length, 1)
  return [
    home.points, away.points,
    home.goalsFor, home.goalsAgainst,
    away.goalsFor, away.goalsAgainst,
    home.goalDifference, away.goalDifference,
    home.wins, away.wins,
    (homeH2hPoints - awayH2hPoints) / h2hCount,
    (homeH2hGoals - awayH2hGoals) / h2hCount,
  ]
}

// Arma filas de entrenamiento a partir del historial de Champions.
// Para cada partido, primero consulta resultados anteriores, calcula sus variables y guarda
// el marcador real como target; solo después agrega el marcador a las historias futuras.
export function buildExamples(matches) {
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date))
  const teamHistory = new Map() // club -> resultados anteriores en orden de fecha
  const pairHistory = new Map() // pareja ordenada de clubes -> duelos directos anteriores
  const examples = []
  // Partidos con la misma fecha se tratan como una jornada: ninguno usa el marcador de otro de ese día.
  for (let start = 0; start < ordered.length;) {
    let end = start + 1
    while (end < ordered.length && ordered[end].date === ordered[start].date) end += 1
    const day = ordered.slice(start, end)
    const additions = []
    for (const match of day) {
      const homeHistory = teamHistory.get(match.home_team) ?? []
      const awayHistory = teamHistory.get(match.away_team) ?? []
      const pairKey = [match.home_team, match.away_team].sort((a, b) => a.localeCompare(b)).join('::')
      const previousMeetings = pairHistory.get(pairKey) ?? []
      // Se descartan inicios de historial con menos de tres partidos conocidos por cada equipo.
      if (homeHistory.length >= 3 && awayHistory.length >= 3) {
        examples.push({
          date: match.date, season: match.season, home: match.home_team, away: match.away_team,
          features: makeFeatures(homeHistory, awayHistory, previousMeetings.map((game) => ({ ...game, homePerspective: match.home_team }))),
          target: RESULT_CLASSES[resultIndex(match.home_goals, match.away_goals)],
        })
      }
      const target = resultIndex(match.home_goals, match.away_goals)
      additions.push({ match, pairKey, homePoints: target === 0 ? 3 : target === 1 ? 1 : 0, awayPoints: target === 2 ? 3 : target === 1 ? 1 : 0 })
    }
    // Solo después de crear los ejemplos de la fecha se guardan sus resultados en los historiales.
    for (const { match, pairKey, homePoints, awayPoints } of additions) {
      const homeHistory = teamHistory.get(match.home_team) ?? []
      const awayHistory = teamHistory.get(match.away_team) ?? []
      teamHistory.set(match.home_team, [...homeHistory, { gf: match.home_goals, ga: match.away_goals, points: homePoints }])
      teamHistory.set(match.away_team, [...awayHistory, { gf: match.away_goals, ga: match.home_goals, points: awayPoints }])
      const previousMeetings = pairHistory.get(pairKey) ?? []
      pairHistory.set(pairKey, [...previousMeetings, match])
    }
    start = end
  }
  return { examples, teamHistory }
}

// Para una predicción de demostración usamos la última forma conocida en el CSV.
// No representa un calendario en vivo ni incorpora alineaciones actuales.
export function upcomingFeatures(matches, homeName, awayName) {
  const history = new Map()
  const directMeetings = []
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date))
  for (const match of ordered) {
    const h = history.get(match.home_team) ?? []
    const a = history.get(match.away_team) ?? []
    const result = resultIndex(match.home_goals, match.away_goals)
    history.set(match.home_team, [...h, { gf: match.home_goals, ga: match.away_goals, points: result === 0 ? 3 : result === 1 ? 1 : 0 }])
    history.set(match.away_team, [...a, { gf: match.away_goals, ga: match.home_goals, points: result === 2 ? 3 : result === 1 ? 1 : 0 }])
    if ([match.home_team, match.away_team].includes(homeName) && [match.home_team, match.away_team].includes(awayName)) directMeetings.push({ ...match, homePerspective: homeName })
  }
  const home = history.get(homeName) ?? []
  const away = history.get(awayName) ?? []
  if (home.length < 3 || away.length < 3) throw new Error('Cada equipo necesita al menos tres partidos anteriores en el historial.')
  return makeFeatures(home, away, directMeetings)
}

function countsFor(rows) {
  const counts = Array(CLASS_COUNT).fill(0)
  for (const row of rows) counts[RESULT_CLASSES.indexOf(row.target)] += 1
  return counts
}
// Reescala una lista de números para que su suma sea 1 (frecuencias o probabilidades).
function normalize(values) {
  const sum = values.reduce((total, value) => total + value, 0) || 1
  return values.map((value) => value / sum)
}
// Convierte puntajes logarítmicos en probabilidades estables que suman 1.
function softmax(logValues) {
  const max = Math.max(...logValues)
  return normalize(logValues.map((value) => Math.exp(value - max)))
}

// 1) NAIVE BAYES GAUSSIANO
// Fase de entrenamiento: por cada clase (local/empate/visitante) aprende la frecuencia,
// el promedio y la varianza de cada variable. La varianza mínima evita divisiones por cero.
export function fitNaiveBayes(rows) {
  const priors = []
  const means = []
  const variances = []
  for (let klass = 0; klass < CLASS_COUNT; klass += 1) {
    const classRows = rows.filter((row) => RESULT_CLASSES.indexOf(row.target) === klass)
    const safeCount = Math.max(classRows.length, 1)
    // Suavizado de Laplace: evita que una clase tenga probabilidad previa exactamente cero.
    priors.push((classRows.length + 1) / (rows.length + CLASS_COUNT))
    const classMeans = Array(FEATURE_COUNT).fill(0)
    for (const row of classRows) for (let f = 0; f < FEATURE_COUNT; f += 1) classMeans[f] += row.features[f] / safeCount
    const classVariances = Array(FEATURE_COUNT).fill(0)
    for (const row of classRows) for (let f = 0; f < FEATURE_COUNT; f += 1) classVariances[f] += (row.features[f] - classMeans[f]) ** 2 / safeCount
    means.push(classMeans)
    variances.push(classVariances.map((value) => Math.max(value, 0.04)))
  }
  const model = { name: 'Naive Bayes', priors, means, variances }
  model.importance = naiveBayesImportance(model)
  return model
}

function gaussianLogDensity(value, mean, variance) {
  return -0.5 * Math.log(2 * Math.PI * variance) - ((value - mean) ** 2) / (2 * variance)
}
// Predicción NB: suma log(P(clase)) + log(P(variable | clase)) y normaliza al final.
// La suma representa el supuesto de independencia condicional entre variables.
export function predictNaiveBayes(model, features) {
  const logScores = RESULT_CLASSES.map((_, klass) => {
    let score = Math.log(clampProbability(model.priors[klass]))
    for (let f = 0; f < FEATURE_COUNT; f += 1) score += gaussianLogDensity(features[f], model.means[klass][f], model.variances[klass][f])
    return score
  })
  return softmax(logScores)
}

// Naive Bayes no tiene una importancia de variable única como los árboles.
// Esta aproximación mide cuánto separan las distribuciones de las tres clases;
// sirve para ordenar señales, no debe compararse como una medida idéntica a Gini.
function naiveBayesImportance(model) {
  const raw = Array(FEATURE_COUNT).fill(0)
  for (let f = 0; f < FEATURE_COUNT; f += 1) {
    let biggestGap = 0
    for (let a = 0; a < CLASS_COUNT; a += 1) for (let b = a + 1; b < CLASS_COUNT; b += 1) {
      const scale = Math.sqrt((model.variances[a][f] + model.variances[b][f]) / 2)
      biggestGap = Math.max(biggestGap, Math.abs(model.means[a][f] - model.means[b][f]) / Math.max(scale, 0.05))
    }
    raw[f] = biggestGap
  }
  return normalize(raw)
}

// Gini = 1 - suma(p(clase)^2). Cero significa que el grupo contiene una sola clase.
function gini(counts) {
  const total = counts.reduce((sum, value) => sum + value, 0) || 1
  return 1 - counts.reduce((sum, value) => sum + (value / total) ** 2, 0)
}
function seededRandom(seed) {
  let state = seed >>> 0
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296 }
}
// Baraja índices con Fisher-Yates y devuelve el subconjunto de variables para una rama.
function chooseFeatures(total, count, random) {
  const values = Array.from({ length: total }, (_, index) => index)
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]
  }
  return values.slice(0, count)
}
function majorityIndex(counts) {
  return counts.indexOf(Math.max(...counts))
}
function classCounts(rows) {
  return countsFor(rows)
}

// Prueba umbrales entre valores contiguos y conserva el que más reduce el Gini ponderado.
// minLeaf evita crear hojas basadas en muy pocos partidos.
function bestSplit(rows, featureIndexes, minLeaf) {
  const parentCounts = classCounts(rows)
  const parentGini = gini(parentCounts)
  let best = null
  for (const feature of featureIndexes) {
    const sorted = [...rows].sort((a, b) => a.features[feature] - b.features[feature])
    const leftCounts = Array(CLASS_COUNT).fill(0)
    const rightCounts = [...parentCounts]
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const klass = RESULT_CLASSES.indexOf(sorted[index].target)
      leftCounts[klass] += 1; rightCounts[klass] -= 1
      const leftSize = index + 1; const rightSize = sorted.length - leftSize
      if (leftSize < minLeaf || rightSize < minLeaf) continue
      const current = sorted[index].features[feature]
      const next = sorted[index + 1].features[feature]
      if (current === next) continue
      const weightedGini = (leftSize / sorted.length) * gini(leftCounts) + (rightSize / sorted.length) * gini(rightCounts)
      const gain = parentGini - weightedGini
      if (!best || gain > best.gain) best = { feature, threshold: (current + next) / 2, gain }
    }
  }
  return best
}

// 2) ÁRBOL DE DECISIÓN
// Cada nodo pregunta si una variable está por encima o debajo de un umbral.
// La recursión termina al llegar a profundidad máxima, tener pocas filas, una sola clase
// o no encontrar un corte que mejore la pureza del grupo.
function buildTree(rows, options, importance, random, depth = 0) {
  const counts = classCounts(rows)
  const isPure = counts.filter((count) => count > 0).length <= 1
  if (depth >= options.maxDepth || rows.length < options.minLeaf * 2 || isPure) return { leaf: true, counts }
  const featureIndexes = options.randomFeatures
    ? chooseFeatures(FEATURE_COUNT, options.randomFeatures, random)
    : Array.from({ length: FEATURE_COUNT }, (_, index) => index)
  const split = bestSplit(rows, featureIndexes, options.minLeaf)
  if (!split || split.gain <= 1e-8) return { leaf: true, counts }
  const left = rows.filter((row) => row.features[split.feature] <= split.threshold)
  const right = rows.filter((row) => row.features[split.feature] > split.threshold)
  if (!left.length || !right.length) return { leaf: true, counts }
  importance[split.feature] += split.gain * rows.length
  return {
    leaf: false, feature: split.feature, threshold: split.threshold, gain: split.gain,
    left: buildTree(left, options, importance, random, depth + 1),
    right: buildTree(right, options, importance, random, depth + 1),
  }
}
function leafProbabilities(counts) {
  // Un conteo +1 pequeño mantiene positivas las tres probabilidades incluso con cero ejemplos.
  return normalize(counts.map((count) => count + 1))
}
function predictTree(tree, features) {
  let node = tree
  // Recorre las preguntas desde la raíz hasta la hoja correspondiente a este partido.
  while (!node.leaf) node = features[node.feature] <= node.threshold ? node.left : node.right
  return leafProbabilities(node.counts)
}
export function fitDecisionTree(rows) {
  const importance = Array(FEATURE_COUNT).fill(0)
  // Profundidad 5 y hoja mínima 28 mantienen pequeño el árbol para poder explicarlo en clase.
  const tree = buildTree(rows, { maxDepth: 5, minLeaf: 28 }, importance, seededRandom(21))
  return { name: 'Árbol de decisión', tree, importance: normalize(importance) }
}
export const predictDecisionTree = (model, features) => predictTree(model.tree, features)

// 3) RANDOM FOREST
// Cada árbol recibe una muestra bootstrap (filas elegidas con reemplazo) y, en cada corte,
// explora solo cuatro variables elegidas al azar. Al final se promedian los votos de 17 árboles.
export function fitRandomForest(rows) {
  const random = seededRandom(501)
  const treeCount = 17
  const sampleSize = Math.min(1100, rows.length)
  const trees = []
  const combinedImportance = Array(FEATURE_COUNT).fill(0)
  for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
    // Elegir con reemplazo permite que algunos partidos se repitan y otros queden fuera del árbol.
    const sample = Array.from({ length: sampleSize }, () => rows[Math.floor(random() * rows.length)])
    const treeImportance = Array(FEATURE_COUNT).fill(0)
    trees.push(buildTree(sample, { maxDepth: 5, minLeaf: 16, randomFeatures: 4 }, treeImportance, random))
    for (let f = 0; f < FEATURE_COUNT; f += 1) combinedImportance[f] += treeImportance[f]
  }
  return { name: 'Random Forest', trees, treeCount, sampleSize, importance: normalize(combinedImportance) }
}
export function predictRandomForest(model, features) {
  const votes = Array(CLASS_COUNT).fill(0)
  for (const tree of model.trees) {
    const probabilities = predictTree(tree, features)
    for (let klass = 0; klass < CLASS_COUNT; klass += 1) votes[klass] += probabilities[klass]
  }
  return votes.map((value) => value / model.trees.length)
}

// Enruta la llamada al algoritmo según el modelo elegido en el dashboard o CLI.
export function predict(model, features) {
  if (model.name === 'Naive Bayes') return predictNaiveBayes(model, features)
  if (model.name === 'Árbol de decisión') return predictDecisionTree(model, features)
  return predictRandomForest(model, features)
}

export function evaluate(model, examples) {
  let correct = 0; let logLoss = 0; let brier = 0
  // Accuracy cuenta aciertos; Log loss y Brier penalizan probabilidades equivocadas.
  for (const example of examples) {
    const probabilities = predict(model, example.features)
    const actual = RESULT_CLASSES.indexOf(example.target)
    if (probabilities.indexOf(Math.max(...probabilities)) === actual) correct += 1
    logLoss -= Math.log(clampProbability(probabilities[actual]))
    for (let klass = 0; klass < CLASS_COUNT; klass += 1) brier += (probabilities[klass] - (klass === actual ? 1 : 0)) ** 2
  }
  const n = Math.max(examples.length, 1)
  return { accuracy: correct / n, logLoss: logLoss / n, brier: brier / n, sample: examples.length }
}

export function explainNaiveBayes(model, features, predictedIndex) {
  const impacts = FEATURES.map((name, feature) => {
    const target = gaussianLogDensity(features[feature], model.means[predictedIndex][feature], model.variances[predictedIndex][feature])
    const alternatives = []
    for (let klass = 0; klass < CLASS_COUNT; klass += 1) if (klass !== predictedIndex) alternatives.push(gaussianLogDensity(features[feature], model.means[klass][feature], model.variances[klass][feature]))
    const impact = target - alternatives.reduce((sum, value) => sum + value, 0) / alternatives.length
    return { name, impact }
  }).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  return impacts.slice(0, 4)
}

export function explainTree(model, features) {
  const steps = []
  let node = model.tree
  while (!node.leaf) {
    const goesLeft = features[node.feature] <= node.threshold
    steps.push(`${FEATURES[node.feature]} ${goesLeft ? '≤' : '>'} ${node.threshold.toFixed(2)}`)
    node = goesLeft ? node.left : node.right
  }
  return steps
}
