import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { createSessionStore } from './auth/session'
import { createConnection } from './db/connection'
import { runMigrations } from './db/migrate'
import { registerAuthIpc } from './ipc/auth'
import { registerCashIpc } from './ipc/cash'
import { registerCatalogIpc } from './ipc/catalog'
import { registerCreditIpc } from './ipc/credit'
import { registerCustomersIpc } from './ipc/customers'
import { registerPrintIpc } from './ipc/print'
import { registerReportsIpc } from './ipc/reports'
import { registerSalesIpc } from './ipc/sales'
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

  // Fase 3/4: la sesion (rol activo) vive en memoria del proceso principal
  // -- ver src/main/auth/session.ts para la justificacion de por que no vive
  // solo en el renderer. Se crea una unica vez por arranque de la app y se
  // pierde al cerrarla (nunca se persiste a disco).
  const session = createSessionStore()
  registerAuthIpc(ipcMain, db, session)
  registerCatalogIpc(ipcMain, db, session)
  registerSalesIpc(ipcMain, db, session)
  registerCashIpc(ipcMain, db, session)
  registerCustomersIpc(ipcMain, db)
  registerCreditIpc(ipcMain, db, session)
  registerReportsIpc(ipcMain, db, session)
  registerPrintIpc(ipcMain, db)

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
