const { contextBridge, ipcRenderer } = require('electron');

// Экспортируем API для рендер-процесса
contextBridge.exposeInMainWorld('electronAPI', {
  // Отправка информации о треке в основной процесс
  sendTrackInfo: (trackInfo) => ipcRenderer.send('track-info', trackInfo),
  
  // Сохранение настроек
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  
  // Получение настроек
  getSettings: () => ipcRenderer.invoke('get-settings'),
  
  // Обработчик для получения ответов от API
  onApiResponse: (callback) => ipcRenderer.on('api-response', (_, data) => callback(data)),
  
  // Обработчик для получения ошибок от API
  onApiError: (callback) => ipcRenderer.on('api-error', (_, error) => callback(error))
});
