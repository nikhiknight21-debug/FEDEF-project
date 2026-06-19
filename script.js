/* ============================================================
   Student Behaviour Hub  —  redeveloped core logic
   All data is stored locally in the browser (localStorage).
   Keys kept backward-compatible with the previous version.
   ============================================================ */

/* ----------------------------- State ----------------------------- */
let isLogin = true;
let selectedStudentId = '';

/* --------------------------- Storage I/O ------------------------- */
const DB = {
    get(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
        catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

function getStudents() { return DB.get('students', []); }
function saveStudents(list) { DB.set('students', list); }

/* ----------------------------- Toast ----------------------------- */
function toast(message, type = 'info') {
    const host = document.getElementById('toastHost');
    if (!host) { alert(message); return; }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerText = message;
    host.appendChild(el);
    const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
    raf(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 250);
    }, 2600);
}

/* ----------------------------- Tabs ------------------------------ */
function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    const panel = document.getElementById('tab-' + name);
    if (panel) panel.classList.add('active');

    if (name === 'overview') { updateDashboard(); updateTimeline(); updateHighRiskList(); }
    if (name === 'students') renderRoster();
    if (name === 'analyze') { populateStudentSelect('analyzeStudent'); updateSubjectOptions(); }
    if (name === 'incidents') { populateStudentSelect('incidentStudent'); renderIncidents(); }
    if (name === 'records') renderRecordsTable();
    if (name === 'tools') { loadEvents(); loadParents(); loadTasks(); loadFeedback(); loadNotifications(); loadChat(); populateCompareSelect(); renderEntryLog(); }
}

/* ------------------------------ Auth ----------------------------- */
function toggleForm() {
    isLogin = !isLogin;
    const title = document.getElementById('formTitle');
    const nameField = document.getElementById('name');
    const button = document.getElementById('authBtn');
    const toggleText = document.getElementById('toggleText');

    if (isLogin) {
        title.innerText = 'Login';
        nameField.style.display = 'block';
        button.innerText = 'Login';
        toggleText.innerHTML = `Don't have an account? <span onclick="toggleForm()">Sign Up</span>`;
    } else {
        title.innerText = 'Sign Up';
        nameField.style.display = 'block';
        button.innerText = 'Sign Up';
        toggleText.innerHTML = `Already have an account? <span onclick="toggleForm()">Login</span>`;
    }
}

/* ===================== ROLE / ADMIN GUARD ===================== */
function getRole() { return DB.get('role', 'teacher'); }
function isAdmin() { return getRole() === 'admin'; }
function requireAdmin() {
    if (isAdmin()) return true;
    toast('Only an admin can remove data. Switch the role to Admin first.', 'warn');
    return false;
}

/* --- Admin passcode: makes the Admin role a real gate, not just a dropdown --- */
let adminUnlocked = false;                       // session-only; cleared on every page load
function getAdminPin() { return DB.get('adminPin', 'admin123'); }
function changeAdminPin() {
    if (!isAdmin()) { toast('Switch to the Admin role first to change the passcode.', 'warn'); return; }
    const cur = prompt('Enter the CURRENT admin passcode:');
    if (cur === null) return;
    if (String(cur) !== getAdminPin()) { toast('Current passcode is incorrect.', 'warn'); return; }
    const next = prompt('Enter a NEW admin passcode (at least 4 characters):');
    if (next === null) return;
    if (String(next).trim().length < 4) { toast('Passcode must be at least 4 characters.', 'warn'); return; }
    DB.set('adminPin', String(next).trim());
    toast('Admin passcode updated.', 'good');
}

/* ===================== ENTRY LOG (who entered) ===================== */
function getEntrants() { return DB.get('entrants', []); }
function recordEntrant(name) {
    name = String(name || '').trim();
    if (!name) return;
    const list = getEntrants();
    const now = new Date().toISOString();
    const existing = list.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (existing) { existing.count = (existing.count || 1) + 1; existing.last = now; }
    else { list.push({ name: name, count: 1, first: now, last: now }); }
    DB.set('entrants', list);
}
function renderEntryLog() {
    const ul = document.getElementById('entryLog'); if (!ul) return;
    const list = getEntrants().slice().sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));
    const countEl = document.getElementById('entryCount');
    if (countEl) countEl.textContent = String(list.length);
    ul.innerHTML = '';
    if (!list.length) { ul.innerHTML = '<li class="muted">No entries recorded yet.</li>'; return; }
    list.forEach(e => {
        const li = document.createElement('li');
        li.className = 'mini-row';
        const when = e.last ? new Date(e.last).toLocaleString() : '';
        li.innerHTML = `<span><strong>${escapeHtml(e.name)}</strong> <small class="muted">×${e.count || 1} · ${when}</small></span>`;
        if (isAdmin()) {
            const btn = document.createElement('button');
            btn.className = 'mini ghost danger admin-only';
            btn.textContent = '×';
            btn.title = 'Remove this entry';
            btn.onclick = () => removeEntrant(e.name);
            li.appendChild(btn);
        }
        ul.appendChild(li);
    });
}
function removeEntrant(name) {
    if (!requireAdmin()) return;
    DB.set('entrants', getEntrants().filter(e => e.name.toLowerCase() !== String(name).toLowerCase()));
    renderEntryLog();
    populateCompareSelect();
    toast('Entry removed.', 'info');
}
function clearEntryLog() {
    if (!requireAdmin()) return;
    if (!confirm('Clear the entire entry log of recorded names?')) return;
    DB.set('entrants', []);
    renderEntryLog();
    populateCompareSelect();
    toast('Entry log cleared.', 'info');
}

function handleAuth() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const currentName = document.getElementById('name').value.trim();

    if (currentName === '') { toast('Please enter the student name.', 'warn'); return; }
    if (email === '' || password === '') { toast('Please fill in email and password.', 'warn'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address.', 'warn'); return; }
    if (password.length < 4) { toast('Password should be at least 4 characters.', 'warn'); return; }

    DB.set('userName', currentName);
    enterDashboard(currentName);
    toast('Signed in successfully.', 'good');
}

function enterDashboard(name) {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    recordEntrant(name);
    renderEntryLog();
    populateCompareSelect();
    displayWelcome(name);
    updateDashboard();
    updateTimeline();
    updateHighRiskList();
}

function displayWelcome(name) {
    const el = document.getElementById('welcome');
    el.innerText = `Welcome, ${name}`;
    el.style.display = 'block';
}

function logout() {
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    toast('Logged out.', 'info');
}

/* ----------------------- Attendance helpers ---------------------- */
function parseAttendanceValue(val) {
    if (!val) return null;
    val = String(val).trim();
    if (val.endsWith('%')) val = val.slice(0, -1).trim();
    if (/^\d+$/.test(val)) return Number(val);
    const m = val.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return (Number(m[1]) + Number(m[2])) / 2;
    const mb = val.match(/below\s*(\d+)/i);
    if (mb) return Math.max(0, Number(mb[1]) - 1);
    return null;
}

/* --------------------- Student select helpers -------------------- */
function populateStudentSelect(id, includeBlank = true) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = includeBlank ? '<option value="">— No specific student —</option>' : '';
    getStudents().forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.innerText = `${s.id} · ${s.name}`;
        sel.appendChild(o);
    });
    sel.value = current;
}

/* ============================ STUDENTS ============================ */
function nextStudentId() {
    const ids = getStudents().map(s => Number((s.id || '').replace(/\D/g, '')) || 0);
    const max = ids.length ? Math.max(...ids) : 0;
    return 'S' + String(max + 1).padStart(3, '0');
}

function renderRoster() {
    const q = (document.getElementById('studentSearch')?.value || '').trim().toLowerCase();
    const tbody = document.querySelector('#rosterTable tbody');
    if (!tbody) return;
    const students = getStudents().filter(s =>
        !q || s.name.toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q));

    document.getElementById('rosterCount').innerText = students.length;
    tbody.innerHTML = '';

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty">No students match. Add one using the form.</td></tr>`;
        return;
    }

    students.forEach(s => {
        const tr = document.createElement('tr');
        const pts = s.points || 0;
        tr.innerHTML = `
            <td>${s.id}</td>
            <td>${escapeHtml(s.name)}</td>
            <td>${s.attendance || '—'}</td>
            <td>${s.stream || '—'}</td>
            <td>${s.subject || '—'}</td>
            <td><span class="points ${pts >= 0 ? 'pos' : 'neg'}">${pts > 0 ? '+' : ''}${pts}</span></td>
            <td class="row-actions">
                <button class="mini" onclick="selectStudent('${s.id}')">View</button>
                <button class="mini ghost" onclick="editStudent('${s.id}')">Edit</button>
                <button class="mini ghost danger admin-only" onclick="deleteStudent('${s.id}')">Del</button>
            </td>`;
        tbody.appendChild(tr);
    });
}

function submitStudent() {
    const editId = document.getElementById('editStudentId').value;
    const name = document.getElementById('fStudentName').value.trim();
    const att = document.getElementById('fStudentAtt').value.trim();
    const stream = document.getElementById('fStudentStream').value;
    const subject = document.getElementById('fStudentSubject').value.trim();
    const notes = document.getElementById('fStudentNotes').value.trim();

    if (!name) { toast('A student needs a name.', 'warn'); return; }

    const students = getStudents();
    if (editId) {
        const s = students.find(x => x.id === editId);
        if (s) { Object.assign(s, { name, attendance: att, stream, subject, notes }); }
        toast('Student updated.', 'good');
    } else {
        students.push({ id: nextStudentId(), name, attendance: att, stream, subject, notes, points: 0, rewards: [] });
        toast('Student added.', 'good');
    }
    saveStudents(students);
    resetStudentForm();
    renderRoster();
    addNotification(`Roster updated: ${name}`);
}

function editStudent(id) {
    const s = getStudents().find(x => x.id === id);
    if (!s) return;
    document.getElementById('editStudentId').value = s.id;
    document.getElementById('fStudentName').value = s.name || '';
    document.getElementById('fStudentAtt').value = s.attendance || '';
    document.getElementById('fStudentStream').value = s.stream || 'ECE';
    document.getElementById('fStudentSubject').value = s.subject || '';
    document.getElementById('fStudentNotes').value = s.notes || '';
    document.getElementById('studentFormTitle').innerText = 'Edit Student';
    document.getElementById('studentSubmitBtn').innerText = 'Save Changes';
    document.getElementById('fStudentName').focus();
}

function resetStudentForm() {
    ['editStudentId', 'fStudentName', 'fStudentAtt', 'fStudentSubject', 'fStudentNotes'].forEach(i => {
        const el = document.getElementById(i); if (el) el.value = '';
    });
    document.getElementById('studentFormTitle').innerText = 'Add Student';
    document.getElementById('studentSubmitBtn').innerText = 'Add Student';
}

function deleteStudent(id) {
    if (!requireAdmin()) return;
    if (!confirm('Remove this student from the roster?')) return;
    saveStudents(getStudents().filter(s => s.id !== id));
    if (selectedStudentId === id) closeProfile();
    renderRoster();
    updateHighRiskList();
    toast('Student removed.', 'info');
}

function selectStudent(id) {
    const s = getStudents().find(x => x.id === id);
    if (!s) return;
    selectedStudentId = id;
    const card = document.getElementById('profileCard');
    const el = document.getElementById('profileContent');
    const att = parseAttendanceValue(s.attendance);
    const pts = s.points || 0;
    const rewards = (s.rewards || []).length;
    el.innerHTML = `
        <div class="profile-head">
            <div><span class="profile-name">${escapeHtml(s.name)}</span> <small>${s.id}</small></div>
            <span class="points ${pts >= 0 ? 'pos' : 'neg'}">${pts > 0 ? '+' : ''}${pts} pts</span>
        </div>
        <div class="profile-grid">
            <div><small>Attendance</small><strong>${s.attendance || '—'}</strong></div>
            <div><small>Stream</small><strong>${s.stream || '—'}</strong></div>
            <div><small>Subject</small><strong>${s.subject || '—'}</strong></div>
            <div><small>Rewards</small><strong>${rewards}</strong></div>
        </div>
        <p class="profile-notes">${escapeHtml(s.notes || 'No notes recorded.')}</p>
        <div class="profile-progress"><div class="subject-progress"><div class="subject-fill" style="width:${att != null ? Math.min(100, att) : 0}%"></div></div></div>
        <div class="btn-row">
            <button class="mini" onclick="addPoints('${s.id}', 1)">+1 Merit</button>
            <button class="mini ghost danger" onclick="addPoints('${s.id}', -1)">-1 Demerit</button>
            <button class="mini ghost" onclick="grantRewardFor('${s.id}')">Grant Reward</button>
            <button class="mini ghost" onclick="predictBehaviourFor('${s.id}')">Predict</button>
        </div>`;
    card.style.display = 'block';
    if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeProfile() {
    selectedStudentId = '';
    document.getElementById('profileCard').style.display = 'none';
}

function addPoints(id, delta) {
    const students = getStudents();
    const s = students.find(x => x.id === id);
    if (!s) return;
    s.points = (s.points || 0) + delta;
    saveStudents(students);
    selectStudent(id);
    renderRoster();
    addNotification(`${delta > 0 ? 'Merit' : 'Demerit'} for ${s.name} (now ${s.points})`);
    toast(`${s.name}: ${delta > 0 ? '+1 merit' : '-1 demerit'} (total ${s.points})`, delta > 0 ? 'good' : 'warn');
}

function grantRewardFor(id) {
    const students = getStudents();
    const s = students.find(x => x.id === id);
    if (!s) return;
    s.rewards = s.rewards || [];
    s.rewards.push({ date: new Date().toISOString() });
    saveStudents(students);
    selectStudent(id);
    addNotification(`Reward granted to ${s.name}`);
    toast(`Reward granted to ${s.name}.`, 'good');
}

function predictBehaviourFor(id) {
    const s = getStudents().find(x => x.id === id);
    if (!s) return;
    const att = parseAttendanceValue(s.attendance);
    const pts = s.points || 0;
    let pred = 'Stable', tone = 'good';
    if (att == null || att < 70 || pts <= -3) { pred = 'At risk'; tone = 'warn'; }
    else if (att < 85 || pts < 0) { pred = 'Monitor'; tone = 'info'; }
    toast(`${s.name}: ${pred}`, tone);
}

/* ===================== ANALYZE / SUBJECTS ======================== */
function subjectsForStream(stream) {
    const map = {
        ECE: ['MFCS', 'DSA-2', 'FDEF', 'Foreign Language', 'CFAI'],
        CSE: ['MFDSA-2', 'DSA-2', 'FDEF', 'Foreign Language', 'CFAI']
    };
    return map[stream] || [];
}

function updateSubjectOptions() {
    const stream = document.getElementById('stream').value;
    const subjectSelect = document.getElementById('subject');
    const options = subjectsForStream(stream);

    if (subjectSelect) {
        subjectSelect.innerHTML = '<option value="">Select Subject</option>';
        options.forEach(v => {
            const o = document.createElement('option');
            o.value = v; o.innerText = v;
            subjectSelect.appendChild(o);
        });
        subjectSelect.disabled = !stream;
    }

    const attContainer = document.getElementById('subjectAttendance');
    if (!attContainer) return;
    if (!stream) { attContainer.innerHTML = '<p class="muted">Select a stream to see subject averages.</p>'; return; }

    const students = getStudents();
    const records = DB.get('records', []);
    const selections = DB.get('subjectAttendanceSelections', {});
    const attendanceOptions = ['100%', '90-99%', '80-89%', '70-79%', 'Below 70%'];
    const rows = [];

    options.forEach(subj => {
        const subjKey = subj.toLowerCase();
        const studentVals = students
            .filter(s => (s.stream || '').toLowerCase() === stream.toLowerCase() && (s.subject || '').toLowerCase() === subjKey)
            .map(s => parseAttendanceValue(s.attendance)).filter(v => v != null);
        const recordVals = records
            .filter(r => (r.stream || '').toLowerCase() === stream.toLowerCase() && (r.subject || '').toLowerCase() === subjKey)
            .map(r => parseAttendanceValue(r.attendancePercent)).filter(v => v != null);
        const all = studentVals.concat(recordVals);
        const avg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
        const selected = selections[subj] || '';

        rows.push(`<li class="subject-att-row">
            <div class="subject-row">
                <div><strong>${subj}</strong><div class="subject-meta">${avg !== null ? `Average ${avg}%` : 'No data yet'}</div></div>
                <select onchange="setSubjectAttendance('${subj}', this.value)">
                    <option value="">Select attendance</option>
                    ${attendanceOptions.map(o => `<option value="${o}" ${selected === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
            </div>
            <div class="subject-choice">${selected ? `Selected: ${selected}` : 'Choose attendance for this subject'}</div>
            <div class="subject-progress"><div class="subject-fill" style="width:${avg !== null ? Math.min(100, avg) : 0}%"></div></div>
        </li>`);
    });
    attContainer.innerHTML = `<ul class="subject-att-list">${rows.join('')}</ul>`;
}

function setSubjectAttendance(subject, value) {
    const selections = DB.get('subjectAttendanceSelections', {});
    if (value) selections[subject] = value; else delete selections[subject];
    DB.set('subjectAttendanceSelections', selections);
    updateSubjectOptions();
}

function checkBehaviour() {
    const attendance = document.getElementById('attendancePercent').value;
    const stream = document.getElementById('stream').value;
    const subject = document.getElementById('subject').value;
    const resultEl = document.getElementById('result');

    if (!attendance || !stream) { toast('Select attendance and stream before analyzing.', 'warn'); return; }

    const pickId = document.getElementById('analyzeStudent').value || selectedStudentId;
    const student = pickId ? getStudents().find(s => s.id === pickId) : null;
    const studentName = student?.name || 'Unknown student';
    const studentId = student?.id || '';

    let behaviourResult = 'Needs improvement';
    if (attendance === '100%' || attendance === '90-99%') behaviourResult = 'Excellent behaviour';
    else if (attendance === '80-89%' || attendance === '70-79%') behaviourResult = 'Average performance';

    const cls = behaviourResult === 'Excellent behaviour' ? 'good' : behaviourResult === 'Average performance' ? 'avg' : 'poor';
    const message = `${studentName}${studentId ? ' (' + studentId + ')' : ''} assessed as ${behaviourResult.toLowerCase()} for ${stream}${subject ? ' · ' + subject : ''}.`;
    resultEl.innerHTML = `<div class="result-pill ${cls}">${behaviourResult}</div><p>${message}</p>`;

    const records = DB.get('records', []);
    records.push({ studentId, name: studentName, attendancePercent: attendance, stream, subject, result: behaviourResult, timestamp: new Date().toISOString() });
    DB.set('records', records);

    updateDashboard();
    updateTimeline();
    addNotification(`Behaviour analyzed for ${studentName}${studentId ? ' ' + studentId : ''}`);
    toast('Behaviour record saved.', 'good');
}

/* ============================ INCIDENTS ========================== */
function logIncident() {
    const text = document.getElementById('incidentText').value.trim();
    const severity = document.getElementById('incidentSeverity').value;
    const studentId = document.getElementById('incidentStudent').value;
    const student = studentId ? getStudents().find(s => s.id === studentId) : null;

    if (!text || !severity) { toast('Describe the incident and choose a severity.', 'warn'); return; }

    const incidents = DB.get('incidents', []);
    incidents.unshift({
        id: 'I' + Date.now(),
        text, severity, status: 'open',
        studentId: studentId || '', studentName: student?.name || '',
        timestamp: new Date().toISOString()
    });
    DB.set('incidents', incidents);
    document.getElementById('incidentText').value = '';
    document.getElementById('incidentSeverity').value = '';
    renderIncidents();
    updateTimeline();
    updateDashboard();
    addNotification(`Incident logged (${severity})`);
    toast('Incident logged.', 'good');
}

function renderIncidents() {
    const list = document.getElementById('incidentList');
    if (!list) return;
    const filter = document.getElementById('incidentFilter')?.value || 'all';
    let incidents = DB.get('incidents', []);
    if (filter === 'open') incidents = incidents.filter(i => i.status !== 'resolved');
    else if (filter === 'resolved') incidents = incidents.filter(i => i.status === 'resolved');
    else if (filter === 'High') incidents = incidents.filter(i => i.severity === 'High');

    list.innerHTML = '';
    if (incidents.length === 0) { list.innerHTML = '<li class="empty">No incidents to show.</li>'; return; }

    incidents.forEach(i => {
        const li = document.createElement('li');
        li.className = `incident-item sev-${(i.severity || 'low').toLowerCase()} ${i.status === 'resolved' ? 'resolved' : ''}`;
        li.innerHTML = `
            <div class="incident-top">
                <span class="sev-badge">${i.severity}</span>
                ${i.studentName ? `<span class="who">${escapeHtml(i.studentName)}</span>` : ''}
                <span class="when">${new Date(i.timestamp).toLocaleString()}</span>
            </div>
            <div class="incident-text">${escapeHtml(i.text)}</div>
            <div class="btn-row">
                <button class="mini ghost" onclick="toggleIncident('${i.id}')">${i.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>
                <button class="mini ghost danger admin-only" onclick="deleteIncident('${i.id}')">Delete</button>
            </div>`;
        list.appendChild(li);
    });
}

function toggleIncident(id) {
    const incidents = DB.get('incidents', []);
    const i = incidents.find(x => x.id === id);
    if (!i) return;
    i.status = i.status === 'resolved' ? 'open' : 'resolved';
    DB.set('incidents', incidents);
    renderIncidents();
    updateDashboard();
}

function deleteIncident(id) {
    if (!requireAdmin()) return;
    DB.set('incidents', DB.get('incidents', []).filter(x => x.id !== id));
    renderIncidents();
    updateDashboard();
    toast('Incident deleted.', 'info');
}

/* ===================== OVERVIEW / DASHBOARD ===================== */
function updateDashboard() {
    const records = DB.get('records', []);
    const excellent = records.filter(r => r.result === 'Excellent behaviour').length;
    const average = records.filter(r => r.result === 'Average performance').length;
    const needs = records.filter(r => r.result === 'Needs improvement').length;
    const total = excellent + average + needs || 1;

    setText('excellentCount', excellent);
    setText('averageCount', average);
    setText('needsCount', needs);

    const bars = document.getElementById('summaryBars');
    if (bars) {
        bars.innerHTML = `
            ${barRow('Excellent', excellent, total, 'good')}
            ${barRow('Average', average, total, 'avg')}
            ${barRow('Needs improve', needs, total, 'poor')}`;
    }

    const students = getStudents();
    const attVals = students.map(s => parseAttendanceValue(s.attendance)).filter(v => v != null);
    const avgAtt = attVals.length ? Math.round(attVals.reduce((a, b) => a + b, 0) / attVals.length) : 0;
    const risk = students.filter(s => { const a = parseAttendanceValue(s.attendance); return a != null && a < 70; }).length;
    const openInc = DB.get('incidents', []).filter(i => i.status !== 'resolved').length;

    setText('kpiStudents', students.length);
    setText('kpiAvgAtt', avgAtt + '%');
    setText('kpiRisk', risk);
    setText('kpiIncidents', openInc);
}

function barRow(label, value, total, cls) {
    const pct = Math.round((value / total) * 100);
    return `<div class="bar-row"><span class="bar-label">${label}</span>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="bar-val">${value}</span></div>`;
}

function updateTimeline() {
    const records = DB.get('records', []);
    const incidents = DB.get('incidents', []);
    const timeline = document.getElementById('timelineList');
    if (!timeline) return;
    timeline.innerHTML = '';

    const recentRecords = records.slice(-5).reverse().map(r => ({
        time: new Date(r.timestamp),
        text: `${r.studentId ? '[' + r.studentId + '] ' : ''}${r.name}: ${r.result}${r.subject ? ' · ' + r.subject : ''} (${r.attendancePercent}, ${r.stream})`
    }));
    const recentIncidents = incidents.slice(0, 5).map(i => ({
        time: new Date(i.timestamp),
        text: `Incident [${i.severity}]${i.studentName ? ' · ' + i.studentName : ''}: ${i.text}`
    }));
    const combined = recentRecords.concat(recentIncidents).sort((a, b) => b.time - a.time).slice(0, 7);

    if (combined.length === 0) {
        timeline.innerHTML = '<li class="empty">No activity yet. Analyze behaviour or log an incident to begin.</li>';
        return;
    }
    combined.forEach(e => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${e.time.toLocaleDateString()}</strong> — ${escapeHtml(e.text)}`;
        timeline.appendChild(li);
    });
}

function updateHighRiskList() {
    const el = document.getElementById('highRiskList');
    if (!el) return;
    const highs = getStudents().filter(s => { const a = parseAttendanceValue(s.attendance); return a != null && a < 70; });
    if (highs.length === 0) { el.innerHTML = '<p class="muted">No students below the safety line.</p>'; return; }
    el.innerHTML = highs.map(h => `<div class="risk-item"><span>${h.id} · ${escapeHtml(h.name)}</span><span class="risk-att">${h.attendance}</span></div>`).join('');
}

/* ============================ RECORDS =========================== */
function renderRecordsTable() {
    const tbody = document.querySelector('#recordsTable tbody');
    if (!tbody) return;
    const q = (document.getElementById('recordSearch')?.value || '').trim().toLowerCase();
    let records = DB.get('records', []).slice().reverse();
    if (q) records = records.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.studentId || '').toLowerCase().includes(q) ||
        (r.result || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q));

    setText('recordCount', records.length);
    tbody.innerHTML = '';
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No records found.</td></tr>';
        return;
    }
    records.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.studentId || 'N/A'}</td><td>${escapeHtml(r.name || '')}</td><td>${r.attendancePercent || 'N/A'}</td><td>${r.stream || 'N/A'}</td><td>${r.subject || 'N/A'}</td><td>${r.result || ''}</td><td>${new Date(r.timestamp).toLocaleString()}</td>`;
        tbody.appendChild(tr);
    });
}

function clearRecords() {
    if (!requireAdmin()) return;
    if (!confirm('Clear all saved behaviour records?')) return;
    localStorage.removeItem('records');
    renderRecordsTable();
    updateDashboard();
    updateTimeline();
    toast('Records cleared.', 'info');
}

function exportPDF() {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) { toast('PDF library not loaded.', 'warn'); return; }
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('Student Behaviour Records', 10, 14);
    doc.setFontSize(10);
    const records = DB.get('records', []);
    if (!records.length) { toast('No records to export.', 'warn'); return; }
    records.slice(-40).forEach((r, i) => {
        const id = r.studentId ? `${r.studentId} - ` : '';
        doc.text(`${i + 1}. ${id}${r.name} | ${r.result} | ${r.attendancePercent || 'N/A'} | ${r.stream || ''}`, 10, 24 + i * 6);
    });
    doc.save('behaviour-records.pdf');
    toast('PDF exported.', 'good');
}

function exportExcel() {
    if (!window.XLSX) { toast('Excel library not loaded.', 'warn'); return; }
    const records = DB.get('records', []);
    if (!records.length) { toast('No records to export.', 'warn'); return; }
    const ws = XLSX.utils.json_to_sheet(records);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Records');
    XLSX.writeFile(wb, 'behaviour-records.xlsx');
    toast('Excel exported.', 'good');
}

function exportJSON() { backupData(); }

function printRecords() {
    switchTab('records');
    setTimeout(() => window.print(), 150);
}

/* ============================== TOOLS =========================== */
// Events
function loadEvents() {
    const ul = document.getElementById('eventList'); if (!ul) return;
    const ev = DB.get('events', []); ul.innerHTML = '';
    if (!ev.length) { ul.innerHTML = '<li class="empty">No events scheduled.</li>'; return; }
    ev.forEach((e, idx) => ul.appendChild(miniItem(`${e.date} — ${escapeHtml(e.title)}`, () => removeFromList('events', idx, loadEvents))));
}
function addEvent() {
    const date = document.getElementById('eventDate').value;
    const title = document.getElementById('eventTitle').value.trim();
    if (!date || !title) { toast('Add a date and title.', 'warn'); return; }
    const ev = DB.get('events', []); ev.push({ date, title }); DB.set('events', ev);
    document.getElementById('eventTitle').value = ''; loadEvents();
    toast('Event added.', 'good');
}

// Parents
function loadParents() {
    const ul = document.getElementById('parentList'); if (!ul) return;
    const ps = DB.get('parents', []); ul.innerHTML = '';
    if (!ps.length) { ul.innerHTML = '<li class="empty">No contacts saved.</li>'; return; }
    ps.forEach((p, idx) => ul.appendChild(miniItem(`${escapeHtml(p.name)} — ${escapeHtml(p.phone)}`, () => removeFromList('parents', idx, loadParents))));
}
function saveParent() {
    const name = document.getElementById('parentName').value.trim();
    const phone = document.getElementById('parentPhone').value.trim();
    if (!name || !phone) { toast('Add a parent name and phone.', 'warn'); return; }
    const ps = DB.get('parents', []); ps.push({ name, phone }); DB.set('parents', ps);
    document.getElementById('parentName').value = ''; document.getElementById('parentPhone').value = '';
    loadParents(); toast('Contact saved.', 'good');
}

// Tasks
function loadTasks() {
    const ul = document.getElementById('taskList'); if (!ul) return;
    const ts = DB.get('tasks', []); ul.innerHTML = '';
    if (!ts.length) { ul.innerHTML = '<li class="empty">No tasks yet.</li>'; return; }
    ts.forEach((t, idx) => {
        const li = document.createElement('li');
        li.className = 'mini-row' + (t.status === 'done' ? ' done' : '');
        li.innerHTML = `<span onclick="toggleTask(${idx})">${escapeHtml(t.text)} <em>[${t.status}]</em></span>
            <button class="mini ghost danger admin-only" onclick="removeFromList('tasks', ${idx}, loadTasks)">×</button>`;
        ul.appendChild(li);
    });
}
function addTask() {
    const text = document.getElementById('taskInput').value.trim();
    if (!text) { toast('Enter a task.', 'warn'); return; }
    const ts = DB.get('tasks', []); ts.push({ text, status: 'pending', time: new Date().toISOString() });
    DB.set('tasks', ts); document.getElementById('taskInput').value = ''; loadTasks();
}
function toggleTask(idx) {
    const ts = DB.get('tasks', []); if (!ts[idx]) return;
    ts[idx].status = ts[idx].status === 'done' ? 'pending' : 'done';
    DB.set('tasks', ts); loadTasks();
}

// Feedback
function loadFeedback() {
    const ul = document.getElementById('feedbackList'); if (!ul) return;
    const f = DB.get('feedback', []); ul.innerHTML = '';
    if (!f.length) { ul.innerHTML = '<li class="empty">No feedback saved.</li>'; return; }
    f.slice(-30).reverse().forEach(ff => ul.appendChild(miniItem(`${new Date(ff.time).toLocaleString()} — ${escapeHtml(ff.text)}`)));
}
function saveFeedback() {
    const text = document.getElementById('feedbackInput').value.trim();
    if (!text) { toast('Write some feedback first.', 'warn'); return; }
    const f = DB.get('feedback', []); f.push({ text, time: new Date().toISOString() }); DB.set('feedback', f);
    document.getElementById('feedbackInput').value = ''; loadFeedback(); toast('Feedback saved.', 'good');
}

// Compare
function populateCompareSelect() {
    const sel = document.getElementById('compareSelect'); if (!sel) return;
    sel.innerHTML = '';
    // Merge roster students with recorded entrant names (unique by name)
    const map = new Map();
    getStudents().forEach(s => { map.set(s.name.toLowerCase(), { name: s.name, student: s, entrant: null }); });
    getEntrants().forEach(e => {
        const key = e.name.toLowerCase();
        if (map.has(key)) map.get(key).entrant = e;
        else map.set(key, { name: e.name, student: null, entrant: e });
    });
    [...map.values()].forEach(v => {
        const o = document.createElement('option');
        o.value = v.name;
        let label = v.name;
        if (v.student) label += ` (${v.student.id})`;
        if (v.entrant) label += ` · entered ×${v.entrant.count || 1}`;
        o.textContent = label;
        sel.appendChild(o);
    });
}
function compareSelected() {
    const sel = document.getElementById('compareSelect');
    const names = [...sel.selectedOptions].map(o => o.value);
    const out = document.getElementById('compareResult');
    if (names.length < 2) { toast('Pick at least two names (Ctrl/Cmd-click).', 'warn'); return; }
    const students = getStudents();
    const entrants = getEntrants();
    out.innerHTML = names.map(nm => {
        const s = students.find(x => x.name.toLowerCase() === nm.toLowerCase());
        const e = entrants.find(x => x.name.toLowerCase() === nm.toLowerCase());
        const att = s ? parseAttendanceValue(s.attendance) : null;
        const bar = `<div class="subject-progress"><div class="subject-fill" style="width:${att != null ? Math.min(100, att) : 0}%"></div></div>`;
        const meta = [];
        if (s) meta.push(`Att ${s.attendance || '—'}`, `${s.subject || '—'}`, `${(s.points || 0)} pts`);
        else meta.push('Not in roster');
        if (e) meta.push(`entered ×${e.count || 1}`);
        return `<div class="compare-item"><strong>${escapeHtml(nm)}</strong> ${s ? `<small>${s.id}</small>` : ''}
            ${bar}
            <span>${meta.join(' · ')}</span></div>`;
    }).join('');
}

// Notifications
function loadNotifications() { renderNotifications(DB.get('notifications', [])); }
function addNotification(msg) {
    const ns = DB.get('notifications', []);
    ns.unshift({ text: msg, time: new Date().toISOString() });
    DB.set('notifications', ns.slice(0, 50));
    renderNotifications(ns);
}
function renderNotifications(list) {
    const ul = document.getElementById('notificationsList'); if (!ul) return;
    ul.innerHTML = '';
    if (!list.length) { ul.innerHTML = '<li class="empty">No notifications.</li>'; return; }
    list.slice(0, 20).forEach(n => ul.appendChild(miniItem(`${new Date(n.time).toLocaleTimeString()} — ${escapeHtml(n.text)}`)));
}
function clearNotifications() { if (!requireAdmin()) return; localStorage.removeItem('notifications'); loadNotifications(); }

// Chat
function loadChat() {
    const el = document.getElementById('chatLog'); if (!el) return;
    const log = DB.get('chat', []);
    el.innerHTML = '';
    if (!log.length) { el.innerHTML = '<div class="muted">No messages yet.</div>'; return; }
    log.forEach(m => {
        const d = document.createElement('div');
        d.className = 'chat-message ' + (m.role && m.role.toLowerCase().startsWith('u') ? 'user' : 'bot');
        d.innerText = m.text;
        el.appendChild(d);
    });
    el.scrollTop = el.scrollHeight;
}
function sendChat() {
    const inp = document.getElementById('chatInput');
    const text = inp.value.trim();
    if (!text) return;
    const log = DB.get('chat', []);
    log.push({ role: 'User', text, time: new Date().toISOString() });
    const lower = text.toLowerCase();
    let reply = 'Observe patterns over about two weeks, and contact parents if the behaviour persists.';
    if (lower.includes('attendance')) reply = 'Low attendance often signals disengagement — a quick follow-up usually helps.';
    if (lower.includes('reward') || lower.includes('merit')) reply = 'Small, immediate rewards plus public recognition reinforce good behaviour best.';
    if (lower.includes('incident')) reply = 'Log the action you took on each incident so it can be shared with parents later.';
    if (lower.includes('risk')) reply = 'Check the Overview tab — high-risk students sit below the 70% attendance line.';
    log.push({ role: 'Assistant', text: reply, time: new Date().toISOString() });
    DB.set('chat', log);
    inp.value = '';
    loadChat();
}

/* ============================ SETTINGS ========================== */
function applyRole(value, opts) {
    opts = opts || {};
    let role = value || document.getElementById('roleSelect').value;

    // Admin is protected: it must be unlocked with the passcode each session.
    if (role === 'admin' && !adminUnlocked) {
        if (opts.fromInit) {
            // Never silently restore Admin across reloads — force an explicit unlock.
            role = 'teacher';
        } else {
            const entered = prompt('Enter the admin passcode to unlock data removal:');
            if (entered === null || String(entered) !== getAdminPin()) {
                if (entered !== null) toast('Incorrect admin passcode.', 'warn');
                role = 'teacher';
            } else {
                adminUnlocked = true;
                toast('Admin access unlocked — you can now remove data.', 'good');
            }
        }
    }
    if (role !== 'admin') adminUnlocked = false;   // leaving Admin re-locks it

    DB.set('role', role);
    // keep both selectors in sync
    const a = document.getElementById('roleSelect'); if (a) a.value = role;
    const b = document.getElementById('roleSelect2'); if (b) b.value = role;
    // parents/students see a trimmed view: hide the Analyze + Settings management tabs
    const restricted = role === 'parent' || role === 'student';
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (['analyze', 'settings'].includes(btn.dataset.tab)) btn.style.display = restricted ? 'none' : '';
    });
    // only admins may remove data: hide every destructive control
    document.body.classList.toggle('not-admin', role !== 'admin');
    renderEntryLog();
    if (!opts.fromInit) addNotification(`Switched to ${role} view`);
    if (!opts.silent) toast(`${role.charAt(0).toUpperCase() + role.slice(1)} view active.`, 'info');
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark');
    DB.set('dark', isDark);
    document.querySelectorAll('#darkToggleBtn').forEach(b => b.innerText = isDark ? 'Light Mode' : 'Dark Mode');
}

function backupData() {
    const keys = ['students', 'records', 'incidents', 'events', 'parents', 'tasks', 'feedback', 'notifications', 'chat', 'subjectAttendanceSelections', 'userName', 'role'];
    const data = {};
    keys.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); });
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `behaviour-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded.', 'good');
}

function restoreData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const data = parsed.data || parsed;
            Object.keys(data).forEach(k => localStorage.setItem(k, JSON.stringify(data[k])));
            toast('Backup restored. Reloading…', 'good');
            setTimeout(() => location.reload(), 800);
        } catch {
            toast('That file is not a valid backup.', 'warn');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function resetAll() {
    if (!requireAdmin()) return;
    if (!confirm('Erase ALL local data (students, records, incidents, everything)?')) return;
    ['students', 'records', 'incidents', 'events', 'parents', 'tasks', 'feedback', 'notifications', 'chat', 'subjectAttendanceSelections'].forEach(k => localStorage.removeItem(k));
    toast('All data erased. Reloading…', 'info');
    setTimeout(() => location.reload(), 800);
}

/* ============================= Helpers ========================== */
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = String(val); }
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function miniItem(text, onDelete) {
    const li = document.createElement('li');
    li.className = 'mini-row';
    if (onDelete) {
        li.innerHTML = `<span>${text}</span><button class="mini ghost danger admin-only">×</button>`;
        li.querySelector('button').onclick = onDelete;
    } else {
        li.innerHTML = `<span>${text}</span>`;
    }
    return li;
}
function removeFromList(key, idx, reload) {
    if (!requireAdmin()) return;
    const arr = DB.get(key, []);
    arr.splice(idx, 1);
    DB.set(key, arr);
    reload();
}

/* ============================== Init ============================ */
function seedStudentsIfEmpty() {
    let students = getStudents();
    if (students.length === 0) {
        students = [
            { id: 'S001', name: 'Amina Ali', attendance: '95%', stream: 'CSE', subject: 'DSA-2', notes: 'Consistent and engaged.', points: 2, rewards: [] },
            { id: 'S002', name: 'Ben Carter', attendance: '68%', stream: 'ECE', subject: 'MFCS', notes: 'Attendance slipping recently.', points: -1, rewards: [] },
            { id: 'S003', name: 'Chen Li', attendance: '82%', stream: 'CSE', subject: 'FDEF', notes: '', points: 0, rewards: [] }
        ];
        saveStudents(students);
    } else {
        // backfill missing fields on older data
        let changed = false;
        students = students.map((s, i) => {
            if (!s.id) { changed = true; s.id = 'S' + String(i + 1).padStart(3, '0'); }
            if (s.points == null) { changed = true; s.points = 0; }
            return s;
        });
        if (changed) saveStudents(students);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (DB.get('dark', false)) {
        document.body.classList.add('dark');
        document.querySelectorAll('#darkToggleBtn').forEach(b => b.innerText = 'Light Mode');
    }

    seedStudentsIfEmpty();

    const storedName = DB.get('userName', '');
    if (storedName) document.getElementById('name').value = storedName;

    const savedRole = DB.get('role', 'teacher');
    applyRole(savedRole, { fromInit: true, silent: true });

    // Render everything once so tabs are ready when first opened
    renderRoster();
    updateSubjectOptions();
    renderIncidents();
    renderRecordsTable();
    loadEvents(); loadParents(); loadTasks(); loadFeedback();
    loadNotifications(); loadChat(); populateCompareSelect(); renderEntryLog();
    populateStudentSelect('analyzeStudent');
    populateStudentSelect('incidentStudent');
    updateDashboard(); updateTimeline(); updateHighRiskList();
});
