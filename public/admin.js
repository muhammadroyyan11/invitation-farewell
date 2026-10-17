const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const dashboardError = document.querySelector('#dashboard-error');
const search = document.querySelector('#search-name');
const filter = document.querySelector('#status-filter');
const clearButton = document.querySelector('#clear-participants-button');
const dashboardFeedback = document.querySelector('#dashboard-feedback');
const labels = { hadir: 'Hadir', menyusul: 'Menyusul / shift 2', 'tidak-hadir': 'Berhalangan' };
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
let responses = [];
let loading = false;
let clearing = false;

function showLogin() {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  responses = [];
  clearButton.disabled = true;
  dashboardFeedback.hidden = true;
  document.querySelector('#response-rows').replaceChildren();
}

function renderResponses() {
  clearButton.disabled = responses.length === 0 || loading || clearing;
  document.querySelector('#count-total').textContent = responses.length;
  for (const status of Object.keys(labels)) document.querySelector(`#count-${status}`).textContent = responses.filter(entry => entry.status === status).length;
  const query = search.value.trim().toLocaleLowerCase('id-ID');
  const visible = responses.filter(entry => entry.name.toLocaleLowerCase('id-ID').includes(query) && (filter.value === 'all' || entry.status === filter.value));
  const rows = document.querySelector('#response-rows');
  rows.replaceChildren();
  for (const entry of visible) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = entry.name;
    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge-${entry.status}`;
    badge.textContent = labels[entry.status];
    status.append(badge);
    const message = document.createElement('td');
    message.textContent = entry.message || '—';
    const updatedAt = document.createElement('td');
    updatedAt.textContent = dateFormat.format(new Date(entry.updatedAt));
    row.append(name, status, message, updatedAt);
    rows.append(row);
  }
  const empty = document.querySelector('#empty-state');
  empty.hidden = visible.length > 0;
  empty.textContent = responses.length ? 'Tidak ada konfirmasi yang cocok dengan pencarianmu.' : 'Belum ada konfirmasi. Bagikan undangannya, yuk!';
}

async function loadResponses() {
  if (loading || clearing) return;
  loading = true;
  dashboardError.hidden = true;
  const refresh = document.querySelector('#refresh-button');
  refresh.disabled = true;
  clearButton.disabled = true;
  try {
    const response = await fetch('/api/admin/responses', { cache: 'no-store' });
    if (response.status === 401) {
      showLogin();
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Rekap belum dapat dimuat.');
    responses = result.responses.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    loginPanel.hidden = true;
    dashboard.hidden = false;
    renderResponses();
    document.querySelector('#last-updated').textContent = `Terakhir dimuat ${dateFormat.format(new Date())} · Waktu mengikuti zona waktu perangkatmu. Rekap diperbarui otomatis setiap 30 detik.`;
  } catch {
    if (dashboard.hidden) {
      loginError.textContent = 'Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.';
      loginError.hidden = false;
    } else {
      dashboardError.textContent = 'Rekap belum berhasil diperbarui. Data yang ditampilkan adalah hasil pemuatan terakhir.';
      dashboardError.hidden = false;
    }
  } finally {
    loading = false;
    refresh.disabled = false;
    clearButton.disabled = responses.length === 0 || clearing;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  loginError.hidden = true;
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: loginForm.elements.password.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gagal masuk. Silakan coba lagi.');
    loginForm.reset();
    await loadResponses();
  } catch (error) {
    loginError.textContent = error instanceof TypeError ? 'Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.' : error.message;
    loginError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/admin/logout', { method: 'POST' });
    if (!response.ok && response.status !== 401) throw new Error();
    showLogin();
    loginForm.elements.password.focus();
  } catch {
    dashboardError.textContent = 'Belum berhasil keluar. Periksa koneksi lalu coba lagi.';
    dashboardError.hidden = false;
  }
});

clearButton.addEventListener('click', async () => {
  if (loading || clearing || responses.length === 0) return;
  if (!window.confirm('Hapus SEMUA peserta, termasuk konfirmasi dan pesan mereka?\n\nTindakan ini tidak dapat dibatalkan, termasuk peserta yang tidak terlihat karena filter. Unduh CSV terlebih dahulu jika diperlukan.')) return;
  clearing = true;
  clearButton.disabled = true;
  clearButton.textContent = 'Menghapus...';
  const refresh = document.querySelector('#refresh-button');
  refresh.disabled = true;
  dashboardError.hidden = true;
  dashboardFeedback.hidden = true;
  try {
    const response = await fetch('/api/admin/responses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'CLEAR_ALL_PARTICIPANTS' })
    });
    if (response.status === 401) {
      showLogin();
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Peserta belum berhasil dihapus. Silakan coba lagi.');
    responses = [];
    search.value = '';
    filter.value = 'all';
    renderResponses();
    dashboardFeedback.textContent = `${result.deletedCount} peserta beserta konfirmasi dan pesannya berhasil dihapus.`;
    dashboardFeedback.hidden = false;
    document.querySelector('#last-updated').textContent = `Rekap dikosongkan ${dateFormat.format(new Date())}.`;
  } catch (error) {
    dashboardError.textContent = error instanceof TypeError ? 'Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.' : error.message;
    dashboardError.hidden = false;
  } finally {
    clearing = false;
    clearButton.textContent = 'Clear participant';
    clearButton.disabled = responses.length === 0;
    refresh.disabled = false;
  }
});

search.addEventListener('input', renderResponses);
filter.addEventListener('change', renderResponses);
document.querySelector('#refresh-button').addEventListener('click', loadResponses);
setInterval(() => { if (!dashboard.hidden && !document.hidden) loadResponses(); }, 30_000);
loadResponses();
