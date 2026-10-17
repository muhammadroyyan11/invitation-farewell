const form = document.querySelector('#rsvp-form');
const successPanel = document.querySelector('#rsvp-success');
const errorPanel = document.querySelector('#form-error');
const submitButton = form.querySelector('button[type="submit"]');
const submitLabel = document.querySelector('#submit-label');
const storageKey = 'farewell-royyan-response';
let savedResponse;

try {
  savedResponse = JSON.parse(localStorage.getItem(storageKey));
  if (savedResponse && (typeof savedResponse.id !== 'string' || typeof savedResponse.editToken !== 'string')) savedResponse = null;
} catch {
  savedResponse = null;
}

function showSuccess(response, focus = true) {
  document.querySelector('#success-name').textContent = response.name;
  const messages = {
    hadir: 'Konfirmasimu sudah tersimpan. Sampai ketemu di Mess Sneakerzone Malang! Jangan lupa bawa cerita terbaikmu.',
    menyusul: 'Konfirmasimu sudah tersimpan. Selesaikan shift 2 dulu, lalu merapat. Kami tunggu, ya!',
    'tidak-hadir': 'Konfirmasimu sudah tersimpan. Terima kasih untuk doa baiknya. Semoga kita bertemu di kesempatan berikutnya.'
  };
  document.querySelector('#success-message').textContent = messages[response.status];
  document.querySelector('.success-event').hidden = response.status === 'tidak-hadir';
  form.hidden = true;
  successPanel.hidden = false;
  if (focus) successPanel.focus({ preventScroll: true });
}

if (savedResponse && typeof savedResponse.name === 'string' && ['hadir', 'menyusul', 'tidak-hadir'].includes(savedResponse.status)) showSuccess(savedResponse, false);

document.querySelector('#edit-response').addEventListener('click', () => {
  successPanel.hidden = true;
  form.hidden = false;
  if (savedResponse) {
    form.elements.name.value = savedResponse.name;
    form.elements.status.value = savedResponse.status;
    form.elements.message.value = savedResponse.message || '';
  }
  submitLabel.textContent = 'Perbarui konfirmasi';
  form.elements.name.focus({ preventScroll: true });
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitButton.disabled) return;
  errorPanel.hidden = true;
  submitButton.disabled = true;
  submitLabel.textContent = 'Menyimpan...';
  const payload = {
    name: form.elements.name.value.trim(),
    status: form.elements.status.value,
    message: form.elements.message.value.trim(),
    id: savedResponse?.id,
    editToken: savedResponse?.editToken
  };
  try {
    const response = await fetch('/api/rsvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Konfirmasi belum tersimpan. Coba lagi, ya.');
    savedResponse = { ...result, message: payload.message };
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedResponse));
    } catch {}
    showSuccess(result);
  } catch (error) {
    errorPanel.textContent = error instanceof TypeError ? 'Belum terhubung ke server. Periksa koneksimu dan coba lagi, ya.' : error.message;
    errorPanel.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = savedResponse ? 'Perbarui konfirmasi' : 'Kirim konfirmasi';
  }
});
