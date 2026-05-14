window.addEventListener('DOMContentLoaded', async () => {

    const textarea    = document.getElementById('note');
    const titleInput  = document.getElementById('note-title');
    const saveBtn     = document.getElementById('save');
    const saveAsBtn   = document.getElementById('save-as');
    const openFileBtn = document.getElementById('open-file');
    const newNoteBtn  = document.getElementById('new-note');
    const noteList    = document.getElementById('note-list');
    const statusEl    = document.getElementById('save_status');

    let notes         = [];
    let currentNoteId = null;
    let debounceTimer = null;
    let isDirty       = false;
    let statusTimer   = null;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function setStatus(msg, isError = false) {
        clearTimeout(statusTimer);
        statusEl.textContent  = msg;
        statusEl.style.color  = isError ? '#e05252' : 'gray';
        if (msg) {
            statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 3000);
        }
    }

    function markDirty() {
        isDirty = true;
        window.electronAPI.setUnsavedChanges(true);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 2000);
        statusEl.textContent = 'Unsaved changes...';
        statusEl.style.color = 'gray';
    }

    function markClean() {
        isDirty = false;
        window.electronAPI.setUnsavedChanges(false);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Sidebar ────────────────────────────────────────────────────────────────

    function renderNotesList() {
        noteList.innerHTML = '';

        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');

            item.innerHTML = `
                <button class="note-item-delete" title="Delete note">&#x2715;</button>
                <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
                <div class="note-item-date">${new Date(note.updatedAt).toLocaleString()}</div>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('note-item-delete')) return;
                switchNote(note.id);
            });

            item.querySelector('.note-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(note.id);
            });

            noteList.appendChild(item);
        });
    }

    // ── Switch note ────────────────────────────────────────────────────────────

    async function switchNote(id) {
        // Cancel any pending auto-save for the previous note first
        clearTimeout(debounceTimer);

        const note = notes.find(n => n.id === id);
        if (!note) return;

        currentNoteId    = id;
        titleInput.value = note.title   || '';
        textarea.value   = note.content || '';

        markClean();
        renderNotesList();
    }

    // ── Save ───────────────────────────────────────────────────────────────────

    async function saveCurrentNote() {
        if (!currentNoteId) {
            setStatus('No note selected', true);
            return;
        }

        clearTimeout(debounceTimer);

        const note = {
            id:      currentNoteId,
            title:   titleInput.value.trim() || 'Untitled',
            content: textarea.value
        };

        try {
            const result = await window.electronAPI.saveNoteJson(note);

            if (!result.success) {
                setStatus('Save failed: ' + (result.error || 'unknown error'), true);
                console.error('[saveCurrentNote] IPC returned failure:', result);
                return;
            }

            // Keep in-memory list in sync so sidebar title updates immediately
            const idx = notes.findIndex(n => n.id === currentNoteId);
            if (idx !== -1) {
                notes[idx] = {
                    ...notes[idx],
                    title:     note.title,
                    content:   note.content,
                    updatedAt: new Date().toISOString()
                };
            }

            markClean();
            renderNotesList();
            setStatus('Saved \u2714');
        } catch (err) {
            setStatus('Save failed \u2716', true);
            console.error('[saveCurrentNote] exception:', err);
        }
    }

    // ── Delete ─────────────────────────────────────────────────────────────────

    async function deleteNote(id) {
        if (!confirm('Delete this note?')) return;

        try {
            const result = await window.electronAPI.deleteNote(id);
            if (!result.success) {
                setStatus('Delete failed', true);
                return;
            }

            notes = notes.filter(n => n.id !== id);

            if (currentNoteId === id) {
                currentNoteId    = null;
                textarea.value   = '';
                titleInput.value = '';
                markClean();
            }

            if (notes.length > 0 && !currentNoteId) {
                await switchNote(notes[0].id);
            } else {
                renderNotesList();
            }
        } catch (err) {
            setStatus('Delete failed \u2716', true);
            console.error('[deleteNote] exception:', err);
        }
    }

    // ── New note ───────────────────────────────────────────────────────────────

    async function createNewNote() {
        const { confirmed } = await window.electronAPI.newNote();
        if (!confirmed) return;

        const now = new Date().toISOString();
        const newNote = {
            id:        Date.now().toString(),
            title:     'Untitled',
            content:   '',
            createdAt: now,
            updatedAt: now
        };

        try {
            const result = await window.electronAPI.saveNoteJson(newNote);
            if (!result.success) {
                setStatus('Could not create note \u2716', true);
                return;
            }
            notes.unshift(newNote);
            await switchNote(newNote.id);
            titleInput.focus();
            titleInput.select();
        } catch (err) {
            setStatus('Could not create note \u2716', true);
            console.error('[createNewNote] exception:', err);
        }
    }

    // ── Export ─────────────────────────────────────────────────────────────────

    async function exportNote() {
        const title   = titleInput.value.trim() || 'Untitled';
        const divider = '\u2500'.repeat(title.length);
        const text    = `${title}\n${divider}\n\n${textarea.value}`;

        const result = await window.electronAPI.saveAs(text);
        if (result.success) setStatus('Exported \u2714');
    }

    // ── Import ─────────────────────────────────────────────────────────────────

    async function importFile() {
        const result = await window.electronAPI.openFile();
        if (!result.success) return;

        const now = new Date().toISOString();
        const imported = {
            id:        Date.now().toString(),
            title:     result.filePath.split(/[\\/]/).pop().replace(/\.txt$/i, ''),
            content:   result.content,
            createdAt: now,
            updatedAt: now
        };

        try {
            const saveResult = await window.electronAPI.saveNoteJson(imported);
            if (!saveResult.success) {
                setStatus('Import failed \u2716', true);
                return;
            }
            notes.unshift(imported);
            await switchNote(imported.id);
            setStatus('Imported \u2714');
        } catch (err) {
            setStatus('Import failed \u2716', true);
            console.error('[importFile] exception:', err);
        }
    }

    // ── Event listeners ────────────────────────────────────────────────────────

    newNoteBtn.addEventListener('click',  createNewNote);
    saveBtn.addEventListener('click',     saveCurrentNote);
    saveAsBtn.addEventListener('click',   exportNote);
    openFileBtn.addEventListener('click', importFile);

    textarea.addEventListener('input',   markDirty);
    titleInput.addEventListener('input', markDirty);

    window.electronAPI.onMenuAction('menu-new-note',  () => createNewNote());
    window.electronAPI.onMenuAction('menu-open-file', () => importFile());
    window.electronAPI.onMenuAction('menu-save',      () => saveCurrentNote());
    window.electronAPI.onMenuAction('menu-save-as',   () => exportNote());

    // ── Init (single path) ────────────────────────────────────────────────────

    try {
        notes = await window.electronAPI.getNotes();
        console.log('[init] loaded', notes.length, 'notes');
    } catch (err) {
        notes = [];
        console.error('[init] getNotes failed:', err);
    }

    if (notes.length > 0) {
        await switchNote(notes[0].id);
    } else {
        renderNotesList();
    }
});