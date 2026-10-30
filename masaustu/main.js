// Enerji Paneli: canlı siteyi kendi penceresinde açan ince Windows kabuğu.
// Site güncellendikçe uygulama da güncel kalır; veri, parola ya da anahtar bu pakette tutulmaz.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const PANEL = process.env.PANEL_URL || 'https://goktugeris-max.github.io/gesizleme/';
const IZINLI = new URL(PANEL).origin;
let pencere = null;

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  app.on('second-instance', () => { if (pencere) { if (pencere.isMinimized()) pencere.restore(); pencere.focus(); } });

  function ac() {
    Menu.setApplicationMenu(null);
    pencere = new BrowserWindow({
      width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#f4f6f9',
      title: 'Enerji Paneli', icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    pencere.maximize();
    pencere.loadURL(PANEL);
    // Panel dışı bağlantılar (portal, harita atfı vb.) varsayılan tarayıcıda açılır
    const disari = (url) => { try { if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url); } catch (e) {} };
    pencere.webContents.setWindowOpenHandler(({ url }) => {
      if (new URL(url).origin === IZINLI) return { action: 'allow' };   // yazdırma/rapor pencereleri
      disari(url); return { action: 'deny' };
    });
    pencere.webContents.on('will-navigate', (ev, url) => { if (new URL(url).origin !== IZINLI) { ev.preventDefault(); disari(url); } });
    // İnternet yoksa/ site açılmazsa yeniden dene sayfası
    pencere.webContents.on('did-fail-load', (ev, kod, aciklama, url, anaCerceve) => {
      if (anaCerceve && kod !== -3) pencere.loadFile(path.join(__dirname, 'hata.html'), { query: { adres: PANEL } });
    });
    // Tarayıcı izinleri (kamera, konum vb.) panelin ihtiyacı yok
    pencere.webContents.session.setPermissionRequestHandler((wc, izin, cb) => cb(false));
    pencere.on('closed', () => { pencere = null; });
  }
  app.whenReady().then(ac);
  app.on('window-all-closed', () => app.quit());
}
