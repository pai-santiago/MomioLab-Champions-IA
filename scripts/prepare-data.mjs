// Este script combina las dos fuentes guardadas en data/source y crea el CSV que usa la app.
// Legacy cubre 1955-56 a 2021-22; OpenFootball completa 2022-23 a 2025-26.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(projectDir, 'data')
const sourceDir = path.join(dataDir, 'source')
const COMPETITION = 'UEFA Champions League / Copa de Europa'

// Parser pequeño para CSV con comillas; así el proyecto no necesita instalar paquetes.
function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(field.trim()); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []; field = ''
    } else field += char
  }
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, ''))
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
function cleanClubName(name) {
  // OpenFootball añade país entre paréntesis; quitamos ese sufijo para unificar nombres.
  return String(name ?? '').replace(/\s+\([A-Z]{3}\)$/, '').trim()
}
function normalizeDate(value) {
  const time = Date.parse(value)
  return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, 10)
}

const legacyText = await fs.readFile(path.join(sourceDir, 'champions_legacy_source.csv'), 'utf8')
const recentText = await fs.readFile(path.join(sourceDir, 'champions_recent_source.csv'), 'utf8')
const legacyRows = parseDelimited(legacyText, ';')
const recentRows = parseDelimited(recentText, ',')
const matches = []

// Normalizamos los resultados históricos; usamos únicamente partidos finalizados con marcador.
// Esta fuente es específica de UEFA Champions League/Copa de Europa y llega a 2021-22.
for (const row of legacyRows) {
  const homeGoals = Number(row.ft1)
  const awayGoals = Number(row.ft2)
  if (row.status !== 'FINISHED' || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue
  const home = cleanClubName(row.t1_name)
  const away = cleanClubName(row.t2_name)
  const date = normalizeDate(row.date)
  if (!home || !away || !date) continue
  matches.push({
    competition: COMPETITION,
    date,
    season: row.season,
    stage: row.round || row.match_type || 'Partido',
    home_team: home,
    away_team: away,
    home_goals: Math.trunc(homeGoals),
    away_goals: Math.trunc(awayGoals),
    source: 'UEFA historical dataset (1955-56 to 2021-22)',
  })
}

// El segundo archivo incluye años repetidos; solo añadimos temporadas posteriores a 2021-22.
// OpenFootball es un conjunto separado de Champions League; su descripción empieza en grupos/liguilla.
for (const row of recentRows) {
  const seasonStart = Number(String(row.season).slice(0, 4))
  if (!Number.isFinite(seasonStart) || seasonStart < 2022) continue
  const scoreA = Number(row.score_a)
  const scoreB = Number(row.score_b)
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue
  const timestamp = Number(row.date)
  const date = Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString().slice(0, 10) : normalizeDate(row.date)
  const teamA = cleanClubName(row.agent_a)
  const teamB = cleanClubName(row.agent_b)
  if (!date || !teamA || !teamB) continue
  const aIsHome = row.homefield === 'agent_a'
  matches.push({
    competition: COMPETITION,
    date,
    season: row.season,
    stage: row.stage || 'Partido',
    home_team: aIsHome ? teamA : teamB,
    away_team: aIsHome ? teamB : teamA,
    home_goals: Math.trunc(aIsHome ? scoreA : scoreB),
    away_goals: Math.trunc(aIsHome ? scoreB : scoreA),
    source: 'OpenFootball (2022-23 to 2025-26)',
  })
}

// Quitamos duplicados exactos entre archivos y ordenamos por fecha antes de crear el CSV final.
const seen = new Set()
const unique = matches.filter((match) => {
  const key = [match.date, match.home_team.toLowerCase(), match.away_team.toLowerCase(), match.home_goals, match.away_goals].join('|')
  if (seen.has(key)) return false
  seen.add(key)
  return true
}).sort((a, b) => a.date.localeCompare(b.date) || a.season.localeCompare(b.season))

const columns = ['competition', 'date', 'season', 'stage', 'home_team', 'away_team', 'home_goals', 'away_goals', 'source']
const output = [columns.join(','), ...unique.map((match) => columns.map((column) => csvCell(match[column])).join(','))].join('\n') + '\n'
await fs.writeFile(path.join(dataDir, 'champions_matches.csv'), output, 'utf8')
console.log(`CSV listo: ${unique.length} partidos (${unique[0]?.season ?? '—'} a ${unique.at(-1)?.season ?? '—'}).`)
console.log(`Fuente histórica: ${legacyRows.length} filas originales; fuente reciente: ${recentRows.length} filas originales.`)
