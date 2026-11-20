// Servidor pequeño sin dependencias: publica la web, el CSV y la guía HTML en local.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 4180)
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
}

const server = http.createServer(async (request, response) => {
  try {
    // Convierte la URL solicitada a una ruta local y rechaza rutas que intenten salir de la carpeta.
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
    const filePath = path.resolve(root, relativePath)
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      response.writeHead(403); response.end('Forbidden'); return
    }
    const info = await stat(filePath)
    if (!info.isFile()) { response.writeHead(404); response.end('Not found'); return }
    const body = await readFile(filePath) // Lee el recurso del proyecto y lo envía con su tipo MIME.
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(body)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Archivo no encontrado')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log('MomioLab Champions listo en http://127.0.0.1:' + port)
  console.log('Para detenerlo, vuelve a esta terminal y presiona Ctrl+C.')
})
