import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { createConnection } from './db/connection'
import { runMigrations } from './db/migrate'
import { needsExperimentalSqliteFlag } from './node-version'

// Task 1.5: agrega el flag `--experimental-sqlite` ANTES de app.ready solo si
// la version de Node empaquetada por esta build de Electron lo requiere (ver
// src/main/node-version.ts). Con Electron 44.3.0 (Node 24.20.0) esto es un
// no-op, pero protege builds futuros que bajen de version.
if (needsExperimentalSqliteFlag(process.versions.node)) {
  app.commandLine.appendSwitch('experimental-sqlite')
}

function getDbPath(): string {
  return join(app.getPath('userData'), 'pescaderia-pos.sqlite')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const db = createConnection(getDbPath())
  runMigrations(db)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
