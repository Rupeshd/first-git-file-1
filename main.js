const { app, BrowserWindow, ipcMain , dialog, Menu, Tray} = require('electron');



app.disableHardwareAcceleration();
const path = require('node:path');
const fs = require('node:fs');
const notesFilePath = path.join(app.getPath('userData'), 'notes.json')
function readnotes(){
    if(!fs.existsSync(notesFilePath)){
        return [];
    }
    const raw = fs.readFileSync(notesFilePath, 'utf-8');
    return JSON.prase(raw);
}

function writeNotes(notes){
    fs.writeFileSync(notesFilePath, JSON.stringify(notes, null,2), 'utf-8');
}

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile('index.html');
    win.on('close', (event)=>{
        event.preventDefault();
        win.hide();
    });
}

let tray = null;

app.whenReady().then(() => {
    createWindow();
    const menuTemplate =[
        {
            label: 'File',
            submenu: [{
                label: 'New Note',
                accelerator: 'CmdorCtrl+N',
                click: () =>{
                    BrowserWindow.getFocusedWindow().webContents.send('menu-new-note');
                }
            },
            {
                label: 'Open File',
                accelerator: 'CmdorCtrl+O',
                click: ()=>{
                    BrowserWindow.getFocusedWindow().webContents.send('menu-open-file');
                }
            },
            {
                label: 'Save',
                accelerator: 'CmdorCtrl+S',
                click: () =>{
                    BrowserWindow.getFocusedWindow().webContents.send('menu-save');
                }
            },
            {
                label: 'Save-as',
                accelerator: 'CmdorCtrl+Shift+S',
                click: () =>{
                    BrowserWindow.getFocusedWindow().webContents.send('menu-save-as');
                }
            },
            {type: 'separator'},
            {
                label: 'Quit',
                accelerator: 'CmdorCtrl+Q',
                click: () => app.quit()
            }
        ]
        }
    ]
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    tray = new Tray(path.join(__dirname, 'Icon.png'));
    const trayMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () =>{
                BrowserWindow.getAllWindows()[0].show();
            }
        },
        {
            label: 'Quit',
            click: () => app.quit()
        }
    ]);
    tray.setToolTip('Quick Note Taker');
    tray.setContextMenu(trayMenu);

    tray.on('double-click', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if(win.isVisible()){
            win.hide();
        }else{
            win.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('save-note', async (event, text) => {
    const filePath = path.join(app.getPath('documents'), 'quicknote.txt');
    fs.writeFileSync(filePath, text, 'utf-8');
    return { success: true };
});

ipcMain.handle('load-note', async () => {
    const filePath = path.join(app.getPath('documents'), 'quicknote.txt');
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
});

ipcMain.handle('save-as', async (event, text) => {
    const result = await dialog.showSaveDialog({
        defaultPath: 'mynote.txt',
        filters: [{name: 'Text Files', extensions: ['txt'] }]
    });
    if (result.canceled) {
        return { success: false };
    }
    fs.writeFileSync(result.filePath, text, 'utf-8');
    return { success: true,  filePath: result.filePath  };
});

ipcMain.handle('new-note',async(event)=>{
    const result = await dialog.showMessageBox({
        type:'warning',
        buttons: ['Discard Changes', 'Cancel'],
        defaultId: 1,
        title:'Unsaved Changes',
        message:'You have unsaved changes. Start a new note anyway?'
    });

    return {confirmed: result.response === 0}; // true if 'Discard Changes' is clicked
});

ipcMain.handle('open-file', async (event)=> {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters :[{name: 'text files', extensions: ['txt']}]
    });
    if(result.canceled){
        return {success: false};
    }
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return {success: true, content, filePath};
});

ipcMain.handle('smart-save', async (event, text , filePath)=> {
    const targetPath = filePath || path.join(app.getPath('documents'), 'quicknote.txt');
    fs.writeFileSync(targetPath, text, 'utf-8');
    return {success: true, filePath: targetPath};
});

ipcMain.handle('get-notes', async () => {
    return readNotes();
});

ipcMain.handle('delete-note', async (event, id) => {
    const notes = readNotes();
    const filtered =notes.filter(n => n.id !==id);
    writeNotes(filtered);
    return {success: true};
});

ipcMain.handle ('save-note-json', async (event, note) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === note.id);
    const now = new Date().toISOString();

    if(index === -1){
        notes.push ({ ...note,createdAt: now, updatedAt: now});

    }
    else {
        notes[index] = { ...notes[index], ...note, updatedAt: now };
    }
    writeNotes(notes);
    return {sucess: true};
})