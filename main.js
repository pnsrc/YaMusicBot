const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const url = require('url');
const Store = require('electron-store');
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();
const tmi = require('tmi.js');
const fs = require('fs');

// Устанавливаем имя приложения
app.name = 'YaMusicBot by @pnsrc';
app.setName('YaMusicBot by @pnsrc');

// Инициализация хранилища
const store = new Store();

// Глобальные переменные для окон и трея
let mainWindow;
let settingsWindow;
let tray = null;
let isQuitting = false;

// URL API для отправки данных
let apiUrl = store.get('apiUrl') || 'https://your-api-endpoint.com/track-info';
// Для хранения информации о текущем треке
let currentTrackInfo = {};



// Загрузка настроек для Twitch-бота с предустановленными значениями
let twitchSettings = {
  twitchChannel: store.get('twitchChannel') || 'SeRRRg0',
  twitchUsername: store.get('twitchUsername') || 'yamusicbot',
  twitchToken: store.get('twitchToken') || 'oauth:7hxajb9m1ta8fd65wri3hpu33hkw55',
  autoAnnounce: store.get('autoAnnounce') !== undefined ? store.get('autoAnnounce') : true
};

// Сохраняем предустановленные настройки в хранилище, если они не были установлены ранее
if (!store.get('twitchChannel')) store.set('twitchChannel', twitchSettings.twitchChannel);
if (!store.get('twitchUsername')) store.set('twitchUsername', twitchSettings.twitchUsername);
if (!store.get('twitchToken')) store.set('twitchToken', twitchSettings.twitchToken);

// Настройка Twitch-бота
let client = new tmi.Client({
    options: { debug: false }, // Отключаем отладочный вывод
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: twitchSettings.twitchUsername,
        password: twitchSettings.twitchToken
    },
    channels: [twitchSettings.twitchChannel]
});

// Подключение Twitch-бота
function startTwitchBot() {
    try {
        // Проверяем настройки окружения
        if (!twitchSettings.twitchUsername || !twitchSettings.twitchToken || !twitchSettings.twitchChannel) {
            console.error('Error: Twitch bot environment variables not set');
            return;
        }
        
        console.log(`Connecting to Twitch as ${twitchSettings.twitchUsername} in channel ${twitchSettings.twitchChannel}`);

        // Подключаемся к Twitch
        client.connect()
            .then(() => {
                console.log('Twitch connection successful');
                
                // Отправляем приветственное сообщение с упоминанием бренда
                setTimeout(() => {
                    client.say(twitchSettings.twitchChannel, 'Всем привет! Этот бот поможет следить за музыкой в эфире. Используйте !track или напишите "что играет", чтобы узнать текущий трек. YaMusicBot by @pnsrc 🎵');
                }, 2000);
            })
            .catch(err => console.error('Twitch connection error:', err));
        
        // Массив ключевых фраз для отслеживания (оставляем русские фразы для пользователей)
        const trackKeywords = ['какой трек', 'что играет', 'что за трек', 'что за музыка', '!track', '!трек'];
        
        // Обработка сообщений в Twitch-боте - вместо fetch используем прямой доступ к данным
        client.on('message', (channel, tags, message, self) => {
            if (self) return; // Игнорируем свои сообщения
            
            const lowerMsg = message.toLowerCase();
            
            // Проверяем наличие ключевых слов
            const hasTrackKeyword = trackKeywords.some(keyword => lowerMsg.includes(keyword));
            
            if (hasTrackKeyword) {
                console.log(`Track request from ${tags.username}`);

                try {
                    // Вместо HTTP запроса используем прямой доступ к переменной
                    if (currentTrackInfo && currentTrackInfo.track && currentTrackInfo.artist) {
                        const response = `@${tags.username}, сейчас играет: ${currentTrackInfo.artist} - ${currentTrackInfo.track} 🎵`;
                        client.say(channel, response);
                        console.log('Track info sent to chat:', currentTrackInfo);
                    } else {
                        console.log('No valid track info available:', currentTrackInfo);
                        client.say(channel, `@${tags.username}, что-то пошло не так, и информация о треке недоступна 😔`);
                    }
                } catch (err) {
                    console.error('Error accessing track data:', err);
                    client.say(channel, `@${tags.username}, ошибка 😔`);
                }
            }
        });
    } catch (error) {
        console.error('Error launching Twitch bot:', error);
    }
}

// Настройка Express сервера
const server = express();
const PORT = 9898;

// Middleware для CORS и JSON
server.use(express.json());
server.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Маршрут для получения информации о текущем треке
server.get('/api/currenttrack', (req, res) => {
  res.json(currentTrackInfo);
});

// Запуск сервера
function startServer() {
  httpServer = server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

// Улучшенная поддержка путей к иконкам на разных ОС
const getIconPath = () => {
  // Сначала проверяем, существует ли директория icons
  const iconsDir = path.join(__dirname, 'icons');
  
  // Если директория не существует, создаём её
  if (!fs.existsSync(iconsDir)) {
    try {
      fs.mkdirSync(iconsDir, { recursive: true });
      console.log(`Created icons directory at ${iconsDir}`);
    } catch (err) {
      console.error(`Error creating icons directory: ${err.message}`);
      // Возвращаем null, если не можем создать директорию
      return null;
    }
  }
  
  // Теперь проверяем наличие иконок
  if (process.platform === 'win32') {
    const icoPath = path.join(iconsDir, 'icon.ico');
    if (fs.existsSync(icoPath)) {
      return icoPath;
    }
  }
  
  // Проверяем наличие PNG иконки
  const pngPath = path.join(iconsDir, 'icon.png');
  if (fs.existsSync(pngPath)) {
    return pngPath;
  }
  
  // Если иконки нет, сообщаем об этом
  console.warn(`Warning: No icon files found in ${iconsDir}`);
  return null;
};

// Получаем путь к иконке
const iconPath = getIconPath();

// Создание основного окна без указания иконки, если её нет
function createMainWindow() {
  const windowOptions = {
    width: 1000,
    height: 800,
    title: 'YaMusicBot by @pnsrc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#ffffff'
  };
  
  // Добавляем иконку только если она существует
  if (iconPath) {
    windowOptions.icon = iconPath;
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.setTitle('YaMusicBot by @pnsrc');
  mainWindow.loadURL('https://music.yandex.ru');

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

// Используем более простой и надежный скрипт для извлечения информации о треке
mainWindow.webContents.on('did-finish-load', () => {
  // Добавляем задержку для полной загрузки страницы
  setTimeout(() => {
    mainWindow.webContents.executeJavaScript(`
      // Расширенная функция получения информации о треке
      function getCurrentTrackInfo() {
        try {
          console.log("Пытаемся получить информацию о треке...");
          
          // МЕТОД 1: Извлечение из DOM - попробуем все возможные селекторы
          const trackSelectors = [
            '.track__name', 
            '.d-track__name',
            '.player-controls__track-name',
            '.player__track-name',
            '.track-type-player .track__name',
            '.track'
          ];

          const artistSelectors = [
            '.track__artists', 
            '.d-track__artists',
            '.player-controls__track-artists',
            '.player__track-artists',
            '.track-type-player .track__artists',
            '.artists'
          ];
          
          let trackElement = null;
          let artistElement = null;
          
          // Пробуем все селекторы для имени трека
          for(const selector of trackSelectors) {
            const element = document.querySelector(selector);
            if(element && element.textContent) {
              trackElement = element;
              break;
            }
          }
          
          // Пробуем все селекторы для имени исполнителя
          for(const selector of artistSelectors) {
            const element = document.querySelector(selector);
            if(element && element.textContent) {
              artistElement = element;
              break;
            }
          }
          
          if (trackElement && artistElement) {
            const trackName = trackElement.textContent.trim();
            const artistName = artistElement.textContent.trim();
            
            console.log("Найдено из DOM: ", trackName, artistName);
            
            return {
              track: trackName,
              artist: artistName,
              url: window.location.href,
              timestamp: new Date().toISOString()
            };
          }
          
          // МЕТОД 2: Извлечение из заголовка страницы
          const title = document.title;
          console.log("Заголовок страницы: ", title);
          
          // Популярные форматы заголовков
          const patterns = [
            /(.*?)\\s*[-–—]\\s*(.*)\\s*[-–—]\\s*Яндекс[\\s\\.]*Музыка/i,
            /(.*?)\\s*[-–—]\\s*(.*)/i
          ];
          
          for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match && match.length > 2) {
              console.log("Извлечено из заголовка:", match[1], match[2]);
              return {
                artist: match[1].trim(),
                track: match[2].trim(),
                url: window.location.href,
                timestamp: new Date().toISOString()
              };
            }
          }
          
          // МЕТОД 3: Попытка найти любую информацию в DOM
          const pageContent = document.body.innerText;
          if (pageContent) {
            // Ищем строки формата "Исполнитель - Название"
            const regex = /([A-Za-zА-Яа-я0-9\\s&]+)\\s*[-–—]\\s*([A-Za-zА-Яа-я0-9\\s]+)/g;
            const matches = [...pageContent.matchAll(regex)];
            
            if (matches.length > 0) {
              // Берем первое совпадение
              console.log("Найдено из контента:", matches[0][1], matches[0][2]);
              return {
                artist: matches[0][1].trim(),
                track: matches[0][2].trim(),
                url: window.location.href,
                timestamp: new Date().toISOString()
              };
            }
          }
          
          console.error("Не удалось извлечь информацию о треке ни одним из методов");
          return { error: "Не удалось найти информацию о треке" };
        } catch (error) {
          console.error("Ошибка при получении информации о треке:", error);
          return { error: "Произошла ошибка при получении информации о треке: " + error.message };
        }
      }

      // Периодический запрос информации о треке
      let lastTitle = document.title;
      let lastTrackData = null;
      
      function checkTrackChanges() {
        // Проверяем изменение заголовка
        const currentTitle = document.title;
        if (currentTitle !== lastTitle) {
          console.log("Заголовок изменился:", currentTitle);
          lastTitle = currentTitle;
          updateTrackInfo();
        }
        
        // Даже если заголовок не изменился, периодически проверяем
        const trackInfo = getCurrentTrackInfo();
        
        // Проверяем, изменилась ли информация о треке
        if (lastTrackData === null || 
            lastTrackData.track !== trackInfo.track || 
            lastTrackData.artist !== trackInfo.artist) {
          console.log("Обнаружен новый трек:", trackInfo);
          lastTrackData = trackInfo;
          window.electronAPI.sendTrackInfo(trackInfo);
        }
      }
      
      function updateTrackInfo() {
        const trackInfo = getCurrentTrackInfo();
        console.log("Отправляем информацию о треке:", trackInfo);
        window.electronAPI.sendTrackInfo(trackInfo);
        lastTrackData = trackInfo;
      }
      
      // Запускаем периодическую проверку
      const trackInterval = setInterval(checkTrackChanges, 3000);
      
      // Также наблюдаем за изменениями в DOM
      function setupTrackChangeObserver() {
        const possibleTargets = [
          '.player-controls',
          '.player',
          '.d-player',
          'body'
        ];
        
        let targetNode = null;
        
        // Находим первый существующий элемент
        for (const selector of possibleTargets) {
          targetNode = document.querySelector(selector);
          if (targetNode) break;
        }
        
        if (!targetNode) {
          console.error("Не удалось найти элемент для наблюдения");
          return;
        }
        
        console.log("Установка наблюдателя на элемент:", targetNode);
        const config = { attributes: true, childList: true, subtree: true };
        
        const callback = function(mutationsList) {
          let shouldUpdate = false;
          
          for (const mutation of mutationsList) {
            // Проверяем только существенные изменения
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              shouldUpdate = true;
              break;
            }
          }
          
          if (shouldUpdate) {
            updateTrackInfo();
          }
        };
        
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        
        // Получаем начальную информацию о треке
        updateTrackInfo();
      }

      // Запускаем наблюдатель после полной загрузки
      if (document.readyState === 'complete') {
        setupTrackChangeObserver();
      } else {
        window.addEventListener('load', setupTrackChangeObserver);
      }
      
      // Обработка случая, когда страница закрывается
      window.addEventListener('beforeunload', () => {
        clearInterval(trackInterval);
      });
      
      // Немедленно получаем текущую информацию о треке
      updateTrackInfo();
    `);
  }, 3000); // Задержка 3 секунды для полной загрузки
});
}

// Создание иконки в трее
function createTray() {
  try {
    // Если иконка не найдена, создаём пустую иконку (1x1 пиксель)
    if (!iconPath) {
      console.warn("No icon found, creating a basic tray icon");
      // Создаем пустой файл иконки
      const emptyIconPath = path.join(__dirname, 'empty-icon.png');
      if (!fs.existsSync(emptyIconPath)) {
        // Создаем пустой 1x1 пиксель PNG файл (минимальный рабочий PNG)
        const emptyPngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        fs.writeFileSync(emptyIconPath, emptyPngBuffer);
      }
      tray = new Tray(emptyIconPath);
    } else {
      tray = new Tray(iconPath);
    }
    
    // Расширенное меню с настройками Twitch и индикацией статуса
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'YaMusicBot by @pnsrc',
        enabled: false,
        icon: iconPath // Некоторые системы могут отображать эту иконку
      },
      { type: 'separator' },
      { 
        label: 'Показать плеер', 
        click: () => mainWindow.show()
      },
      { 
        label: 'Настройки', 
        click: () => createSettingsWindow(),
        submenu: [
          { 
            label: `Twitch: ${twitchSettings.twitchChannel}`,
            click: () => createSettingsWindow()
          },
          {
            label: `Автооповещения: ${twitchSettings.autoAnnounce ? 'Вкл' : 'Выкл'}`,
            click: () => {
              twitchSettings.autoAnnounce = !twitchSettings.autoAnnounce;
              store.set('autoAnnounce', twitchSettings.autoAnnounce);
              createTray(); // Обновляем меню
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: `Twitch статус: ${client && client.readyState() === 'OPEN' ? '🟢 Онлайн' : '🔴 Офлайн'}`,
        click: () => {
          if (client && client.readyState() !== 'OPEN') {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Статус Twitch',
              message: 'Бот не подключен. Хотите подключиться?',
              buttons: ['Да', 'Нет'],
              defaultId: 0
            }).then(result => {
              if (result.response === 0) {
                updateTwitchClient();
                startTwitchBot();
              }
            });
          }
        }
      },
      { type: 'separator' },
      { 
        label: 'Выход', 
        click: () => {
          isQuitting = true;
          app.quit();
        } 
      }
    ]);
    
    tray.setToolTip('YaMusicBot by @pnsrc');
    tray.setContextMenu(contextMenu);
  
    tray.on('click', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
  } catch (error) {
    console.error('Error creating tray icon:', error);
    
    // Аварийный вариант для Windows
    if (process.platform === 'win32') {
      try {
        // Пробуем создать трей без иконки (в Windows это иногда работает)
        tray = new Tray(path.join(__dirname, 'icons', 'icon.png'));
        const contextMenu = Menu.buildFromTemplate([
          { label: 'Show', click: () => mainWindow.show() },
          { label: 'Settings', click: () => createSettingsWindow() },
          { type: 'separator' },
          { label: 'Exit', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setContextMenu(contextMenu);
      } catch (err) {
        console.error('Failed to create tray even with fallback:', err);
      }
    } else {
      // Аварийный вариант без создания трея
      console.error('Could not create tray icon, continuing without it');
    }
  }
}

// Создание окна настроек с той же иконкой
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 550,
    height: 550,
    parent: mainWindow,
    modal: true,
    show: false,
    title: 'Настройки YaMusicBot',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath // Добавляем иконку и для этого окна
  });

  settingsWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'settings.html'),
    protocol: 'file:',
    slashes: true
  }));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Обработка межпроцессорных сообщений - добавляем автоматическое оповещение
let lastTrackInfo = {}; // Для отслеживания изменений трека

// Модифицируем обработчик событий track-info для большей надежности
ipcMain.on('track-info', (event, trackInfo) => {
  console.log('Track info received:', trackInfo);
  
  try {
    // Проверка валидности данных
    if (trackInfo && typeof trackInfo === 'object') {
      // Сохраняем информацию о текущем треке с дополнительной проверкой
      if (trackInfo.track && trackInfo.artist) {
        // Очистка данных перед сохранением
        currentTrackInfo = {
          track: String(trackInfo.track).trim(),
          artist: String(trackInfo.artist).trim(),
          cover: trackInfo.cover || '',
          url: trackInfo.url || '',
          timestamp: trackInfo.timestamp || new Date().toISOString()
        };
        
        // Сохраним также в файл для аварийного восстановления
        const trackDataPath = path.join(app.getPath('userData'), 'lastTrack.json');
        fs.writeFileSync(trackDataPath, JSON.stringify(currentTrackInfo));
        
        console.log('Track info saved:', currentTrackInfo);
        
        // Автоматическое оповещение
        if (twitchSettings.autoAnnounce && 
            (lastTrackInfo.track !== currentTrackInfo.track || lastTrackInfo.artist !== currentTrackInfo.artist)) {
          
          if (client && client.readyState() === 'OPEN') {
            const message = `Сейчас играет: ${currentTrackInfo.artist} - ${currentTrackInfo.track} 🎵`;
            client.say(twitchSettings.twitchChannel, message)
              .then(() => console.log('New track notification sent'))
              .catch(err => console.error('Error sending track notification:', err));
          }
          
          // Обновляем информацию о последнем треке
          lastTrackInfo = {
            track: currentTrackInfo.track,
            artist: currentTrackInfo.artist
          };
        }
      } else {
        console.warn('Received incomplete track info:', trackInfo);
      }
    } else {
      console.error('Invalid track info format received');
    }
  } catch (error) {
    console.error('Error processing track info:', error);
  }
});

// Модифицируйте функцию ipcMain.handle('get-settings')
ipcMain.handle('get-settings', async () => {
  return {
    apiUrl: apiUrl,
    twitchChannel: twitchSettings.twitchChannel || '',
    twitchUsername: twitchSettings.twitchUsername || '',
    twitchToken: twitchSettings.twitchToken || '',
    autoAnnounce: twitchSettings.autoAnnounce,
    twitchConnected: client && client.readyState() === 'OPEN'
  };
});

// Модифицируйте функцию ipcMain.on('save-settings')
ipcMain.on('save-settings', (event, settings) => {
  console.log('Saving settings:', settings);
  
  if (settings.apiUrl !== undefined) {
    apiUrl = settings.apiUrl;
    store.set('apiUrl', apiUrl);
  }
  
  // Сохраняем настройки Twitch
  if (settings.twitchChannel !== undefined) {
    twitchSettings.twitchChannel = settings.twitchChannel;
    store.set('twitchChannel', settings.twitchChannel);
  }
  
  if (settings.twitchUsername !== undefined) {
    twitchSettings.twitchUsername = settings.twitchUsername;
    store.set('twitchUsername', settings.twitchUsername);
  }
  
  if (settings.twitchToken !== undefined) {
    twitchSettings.twitchToken = settings.twitchToken;
    store.set('twitchToken', settings.twitchToken);
  }
  
  if (settings.autoAnnounce !== undefined) {
    twitchSettings.autoAnnounce = settings.autoAnnounce;
    store.set('autoAnnounce', settings.autoAnnounce);
  }
  
  // Перезапускаем Twitch-бота с новыми настройками
  if (client) {
    client.disconnect().then(() => {
      updateTwitchClient();
      startTwitchBot();
      updateTrayMenu(); // Обновляем меню трея
    });
  }
  
  if (settingsWindow) {
    settingsWindow.close();
  }
});

// Добавьте обработчик для проверки соединения с Twitch
ipcMain.handle('test-twitch-connection', async (event, settings) => {
  try {
    // Создаем временного клиента для тестирования
    const testClient = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: false,
        secure: true
      },
      identity: {
        username: settings.twitchUsername,
        password: settings.twitchToken
      },
      channels: [settings.twitchChannel]
    });
    
    // Пробуем подключиться
    await testClient.connect();
    // Если подключение успешно, отключаемся
    await testClient.disconnect();
    
    return { success: true };
  } catch (error) {
    console.error('Test connection failed:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error' 
    };
  }
});

// Функция обновления клиента Twitch с новыми настройками
function updateTwitchClient() {
  client = new tmi.Client({
    options: { debug: false },
    connection: {
      reconnect: true,
      secure: true
    },
    identity: {
      username: twitchSettings.twitchUsername,
      password: twitchSettings.twitchToken
    },
    channels: [twitchSettings.twitchChannel]
  });
}

// Функция для отправки данных в API
async function sendTrackInfoToAPI(trackData) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trackData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const responseData = await response.json();
    console.log("API response:", responseData);
    
  } catch (error) {
    console.error("Error sending data to API:", error);
  }
}

// Добавим функцию для обновления меню трея
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'YaMusicBot by @pnsrc',
      enabled: false
    },
    { type: 'separator' },
    { 
      label: 'Показать плеер', 
      click: () => mainWindow.show()
    },
    { 
      label: 'Настройки', 
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: `Twitch: ${twitchSettings.twitchChannel}`,
      click: () => createSettingsWindow()
    },
    {
      label: `Автооповещения: ${twitchSettings.autoAnnounce ? 'Вкл' : 'Выкл'}`,
      click: () => {
        twitchSettings.autoAnnounce = !twitchSettings.autoAnnounce;
        store.set('autoAnnounce', twitchSettings.autoAnnounce);
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: `Twitch статус: ${client && client.readyState() === 'OPEN' ? '🟢 Онлайн' : '🔴 Офлайн'}`,
      click: () => {
        if (client && client.readyState() !== 'OPEN') {
          updateTwitchClient();
          startTwitchBot();
        }
      }
    },
    { type: 'separator' },
    { 
      label: 'Выход', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

// Инициализация приложения
app.whenReady().then(() => {
  // Загружаем последний известный трек
  try {
    const trackDataPath = path.join(app.getPath('userData'), 'lastTrack.json');
    if (fs.existsSync(trackDataPath)) {
      const savedTrackData = JSON.parse(fs.readFileSync(trackDataPath, 'utf8'));
      if (savedTrackData && savedTrackData.track && savedTrackData.artist) {
        currentTrackInfo = savedTrackData;
        lastTrackInfo = {
          track: savedTrackData.track,
          artist: savedTrackData.artist
        };
        console.log('Loaded last track from storage:', currentTrackInfo);
      }
    }
  } catch (error) {
    console.error('Error loading last track data:', error);
  }
  
  // Настройка иконки для macOS
  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath);
  }
  
  startServer();
  setTimeout(() => {
    startTwitchBot();
  }, 1000);
  createMainWindow();
  createTray();
});

// Обработка закрытия
app.on('before-quit', () => {
  isQuitting = true;
  if (client) {
    client.disconnect();
  }
});