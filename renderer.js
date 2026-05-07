window.addEventListener('DOMContentLoaded', async () => {
    const textarea = document.getElementById('note');
    const saveBtn = document.getElementById('save');
    const statusEl = document.getElementById('status');

    const savedNote = await window.electronAPI.loadNote();
    textarea.value = savedNote;

    let lastSavedText = textarea.value;
    let currentFilePath = null;

    saveBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.smartSave(textarea.value, currentFilePath);
            lastSavedText = textarea.value;
            currentFilePath = result.filePath;
            window.electronAPI.setUnsavedChanges(false);
            if (statusEl) statusEl.textContent = 'Note saved successfully!';
        } catch (err) {
            console.error('Manual save failed:', err);
            if (statusEl) statusEl.textContent = 'Save failed - check console';
        }
    }
    )

    let debouncerTimer;
    async function autoSave() {
        const currentText = textarea.value;
        if (currentText === lastSavedText) {
            if (statusEl) statusEl.textContent = 'No changes - already saved';
            return;
        }
        try {
            await window.electronAPI.saveNote(currentText);
            lastSavedText = currentText;
            window.electronAPI.setUnsavedChanges(false);
            const now = new Date().toLocaleTimeString();
            if (statusEl) statusEl.textContent = `Auto-saved at ${now}`;
        } catch (err) {
            console.error('Auto-save FAILED:', err);
            if (statusEl) statusEl.textContent = 'Auto-save error - check console';
        }
    }

    textarea.addEventListener('input', () => {
        if (statusEl) statusEl.textContent = 'Changes detected - auto-save in 5s...';
        const hasChanges = textarea.value !== lastSavedText;
        window.electronAPI.setUnsavedChanges(hasChanges);
        clearTimeout(debouncerTimer);
        debouncerTimer = setTimeout(autoSave, 5000);
    });

    const saveAsBtn = document.getElementById('save-as');
    saveAsBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.saveAs(textarea.value);
        if (result.success) {
            lastSavedText = textarea.value;
            currentFilePath = result.filePath;
            window.electronAPI.setUnsavedChanges(false);
            statusEl.textContent = `Saved as ${result.filePath}`;
        } else {
            statusEl.textContent = 'Save as cancelled.';
        }
    });
    const newNoteBtn = document.getElementById('new-note');
    //IF there are no unsaved changes, just clear the textarea
    newNoteBtn.addEventListener('click', async () => {
        if (textarea.value === lastSavedText) {
            textarea.value = '';
            lastSavedText = '';
            window.electronAPI.setUnsavedChanges(false);
            statusEl.textContent = 'New note started.';
            return;
        }
        // if there are unsaved changes, ask the user first 
        const result = await window.electronAPI.newNote();
        if (result.confirmed) {
            textarea.value = '';
            lastSavedText = '';
            window.electronAPI.setUnsavedChanges(false);
            statusEl.textContent = 'New note started';
        } else {
            statusEl.textContent = 'New note cancelled.';
        }
    });

    const openFileBtn = document.getElementById('open-file');

    openFileBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.openFile();
        if (result.success) {
            textarea.value = result.content;
            lastSavedText = result.content;
            currentFilePath = result.filePath;
            window.electronAPI.setUnsavedChanges(false);
            statusEl.textContent = `Opened ${result.filePath}`;
        } else {
            statusEl.textContent = 'Open file cancelled.';
        }
    });

    window.electronAPI.onMenuAction('menu-new-note', () => {
        newNoteBtn.click();
    });
    window.electronAPI.onMenuAction('menu-open-file', () => {
        openFileBtn.click();
    });
    window.electronAPI.onMenuAction('menu-save', () => {
        saveBtn.click();
    });
    window.electronAPI.onMenuAction('menu-save-as', () => {
        saveAsBtn.click();
    });
});