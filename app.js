// ========================================================
// GymSlot - Pure Vanilla JavaScript Application Controller
// Single Page Application with Hash Routing & Optimistic UI
// Uses window.ServerAPI for backend requests and database
// ========================================================

const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  currentRoute: '',
  sessions: [],
  selectedDate: '',
  pollingInterval: null,
  isActionInFlight: false
};

// API Call Wrapper
async function api(endpoint, method = 'GET', body = null) {
  const res = await window.ServerAPI.request(endpoint, {
    method,
    token: state.token,
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const err = new Error(res.data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }

  return res.data;
}

// Helpers
function formatHour(hour) {
  const h = Number(hour);
  const start = `${String(h).padStart(2, '0')}:00`;
  const end = `${String((h + 1) % 24).padStart(2, '0')}:00`;
  return `${start} - ${end}`;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Client-Side Routing & Protected Routes
function navigate(route) {
  window.location.hash = route;
}

function handleRouting() {
  const hash = window.location.hash.slice(1) || '/sessions';
  state.currentRoute = hash;

  // Clear polling if leaving sessions view
  if (hash !== '/sessions' && state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }

  // Protected route checks
  if (!state.token || !state.user) {
    if (hash !== '/login') {
      navigate('/login');
      return;
    }
  } else {
    if (hash === '/login') {
      navigate(state.user.role === 'admin' ? '/admin' : '/sessions');
      return;
    }
    // Block members from admin page
    if (hash === '/admin' && state.user.role !== 'admin') {
      showToast('Admin access required.', 'error');
      navigate('/sessions');
      return;
    }
  }

  updateNavbar();

  // Hide all views
  document.querySelectorAll('.page-view').forEach((v) => (v.style.display = 'none'));

  // Show active view
  if (hash === '/login') {
    document.getElementById('view-auth').style.display = 'flex';
  } else if (hash === '/sessions') {
    document.getElementById('view-sessions').style.display = 'flex';
    loadSessions();
    startSessionsPolling();
  } else if (hash === '/my-bookings') {
    document.getElementById('view-my-bookings').style.display = 'flex';
    loadMyBookings();
  } else if (hash === '/admin') {
    document.getElementById('view-admin').style.display = 'flex';
    initAdminPage();
  } else {
    navigate('/sessions');
  }
}

function updateNavbar() {
  const navbar = document.getElementById('main-navbar');
  if (!state.token || !state.user) {
    navbar.style.display = 'none';
    return;
  }

  navbar.style.display = 'block';
  document.getElementById('nav-user-name').textContent = state.user.name;

  const roleBadge = document.getElementById('nav-user-role');
  roleBadge.textContent = state.user.role === 'admin' ? 'Staff' : 'Member';
  roleBadge.className = `role-badge ${state.user.role}`;

  const adminLink = document.getElementById('nav-link-admin');
  adminLink.style.display = state.user.role === 'admin' ? 'inline-block' : 'none';

  document.querySelectorAll('.nav-link').forEach((el) => el.classList.remove('active'));
  if (state.currentRoute === '/sessions') document.getElementById('nav-link-sessions').classList.add('active');
  if (state.currentRoute === '/my-bookings') document.getElementById('nav-link-bookings').classList.add('active');
  if (state.currentRoute === '/admin') document.getElementById('nav-link-admin').classList.add('active');
}

// --- PAGE 1: AUTH ---
let authMode = 'login';

function initAuth() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const groupName = document.getElementById('group-name');
  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const btnSubmit = document.getElementById('btn-auth-submit');
  const errorBanner = document.getElementById('auth-error-banner');

  function setMode(mode) {
    authMode = mode;
    errorBanner.style.display = 'none';
    clearAuthFieldErrors();

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      groupName.style.display = 'none';
      authTitle.textContent = 'Welcome Back';
      authSubtitle.textContent = 'Log in to book your 1-hour workout slots';
      btnSubmit.textContent = 'Log In';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      groupName.style.display = 'flex';
      authTitle.textContent = 'Create an Account';
      authSubtitle.textContent = 'Join GymSlot to reserve workout sessions';
      btnSubmit.textContent = 'Register as Member';
    }
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));

  const inputEmail = document.getElementById('input-email');
  const inputPassword = document.getElementById('input-password');
  const inputName = document.getElementById('input-name');

  inputEmail.addEventListener('input', () => {
    const val = inputEmail.value.trim();
    if (!val) {
      document.getElementById('error-email').textContent = 'Email is required';
      inputEmail.classList.add('input-error');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      document.getElementById('error-email').textContent = 'Please enter a valid email';
      inputEmail.classList.add('input-error');
    } else {
      document.getElementById('error-email').textContent = '';
      inputEmail.classList.remove('input-error');
    }
  });

  inputPassword.addEventListener('input', () => {
    const val = inputPassword.value;
    if (!val) {
      document.getElementById('error-password').textContent = 'Password is required';
      inputPassword.classList.add('input-error');
    } else if (val.length < 6) {
      document.getElementById('error-password').textContent = 'Password must be at least 6 characters';
      inputPassword.classList.add('input-error');
    } else {
      document.getElementById('error-password').textContent = '';
      inputPassword.classList.remove('input-error');
    }
  });

  inputName.addEventListener('input', () => {
    if (authMode === 'register' && !inputName.value.trim()) {
      document.getElementById('error-name').textContent = 'Name is required';
      inputName.classList.add('input-error');
    } else {
      document.getElementById('error-name').textContent = '';
      inputName.classList.remove('input-error');
    }
  });

  document.getElementById('form-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.style.display = 'none';

    const email = inputEmail.value.trim();
    const password = inputPassword.value;
    const name = inputName.value.trim();

    let hasError = false;
    if (authMode === 'register' && !name) {
      document.getElementById('error-name').textContent = 'Name is required';
      hasError = true;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('error-email').textContent = 'Valid email is required';
      hasError = true;
    }
    if (!password || password.length < 6) {
      document.getElementById('error-password').textContent = 'Password must be at least 6 characters';
      hasError = true;
    }
    if (hasError) return;

    btnSubmit.disabled = true;
    btnSubmit.textContent = authMode === 'login' ? 'Logging in...' : 'Registering...';

    try {
      let data;
      if (authMode === 'login') {
        data = await api('/auth/login', 'POST', { email, password });
      } else {
        data = await api('/auth/register', 'POST', { name, email, password });
      }

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      navigate(data.user.role === 'admin' ? '/admin' : '/sessions');
    } catch (err) {
      errorBanner.style.display = 'flex';
      document.getElementById('auth-error-text').textContent = err.message;
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = authMode === 'login' ? 'Log In' : 'Register as Member';
    }
  });

  function fillDemo(email, pass) {
    setMode('login');
    inputEmail.value = email;
    inputPassword.value = pass;
    clearAuthFieldErrors();
  }

  document.getElementById('btn-demo-admin').addEventListener('click', () => fillDemo('admin@gym.com', 'password123'));
  document.getElementById('btn-demo-member1').addEventListener('click', () => fillDemo('khushi@gmail.com', 'password123'));
  document.getElementById('btn-demo-member2').addEventListener('click', () => fillDemo('aditya@gmail.com', 'password123'));

  document.getElementById('btn-logout').addEventListener('click', () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  });
}

function clearAuthFieldErrors() {
  document.getElementById('error-name').textContent = '';
  document.getElementById('error-email').textContent = '';
  document.getElementById('error-password').textContent = '';
  document.querySelectorAll('.form-input').forEach((el) => el.classList.remove('input-error'));
}

// --- PAGE 2: SESSIONS LIST ---
async function loadSessions(isPolling = false) {
  const loading = document.getElementById('sessions-loading');
  const errorAlert = document.getElementById('sessions-error');
  const emptyBox = document.getElementById('sessions-empty');

  if (!isPolling) {
    loading.style.display = 'flex';
    errorAlert.style.display = 'none';
    emptyBox.style.display = 'none';
  }

  try {
    const url = state.selectedDate ? `/sessions?date=${state.selectedDate}` : '/sessions';
    const data = await api(url);

    if (!state.isActionInFlight) {
      state.sessions = data.sessions || [];
      renderSessionsGrid();
    }
  } catch (err) {
    if (!isPolling) {
      errorAlert.style.display = 'flex';
      document.getElementById('sessions-error-text').textContent = err.message || 'Failed to load sessions';
    }
  } finally {
    if (!isPolling) loading.style.display = 'none';
  }
}

function renderSessionsGrid() {
  const grid = document.getElementById('sessions-grid');
  const emptyBox = document.getElementById('sessions-empty');

  if (state.sessions.length === 0) {
    grid.innerHTML = '';
    emptyBox.style.display = 'block';
    document.getElementById('sessions-empty-text').textContent = state.selectedDate
      ? `No sessions scheduled for ${state.selectedDate}.`
      : 'No sessions are currently scheduled.';
    return;
  }

  emptyBox.style.display = 'none';
  grid.innerHTML = state.sessions
    .map((session) => {
      const fillPercent = Math.min(100, Math.round((session.confirmed_count / session.capacity) * 100));
      const isCardFull = session.is_full;
      const isStarted = session.has_started;

      let actionHtml = '';
      if (isStarted) {
        actionHtml = `<button type="button" class="btn btn-disabled btn-block" disabled>Session Started</button>`;
      } else if (session.user_is_booked) {
        actionHtml = `<a href="#/my-bookings" class="btn btn-secondary btn-block">✓ Booked (View Code)</a>`;
      } else if (session.user_is_waitlisted) {
        actionHtml = `<a href="#/my-bookings" class="btn btn-secondary btn-block">⏳ On Waitlist</a>`;
      } else if (isCardFull) {
        actionHtml = `<button type="button" class="btn btn-warning btn-block" onclick="handleJoinWaitlist(${session.id})">Join Waitlist</button>`;
      } else {
        actionHtml = `<button type="button" class="btn btn-primary btn-block" onclick="handleBookSlot(${session.id})">Book Slot</button>`;
      }

      return `
        <div class="session-card ${isCardFull ? 'session-card-full' : ''} ${isStarted ? 'session-card-started' : ''}">
          <div class="session-card-header">
            <span class="session-date-tag">📅 ${session.session_date}</span>
            <span class="session-time-tag">⏰ ${formatHour(session.start_hour)}</span>
          </div>

          <div class="seat-meter-container">
            <div class="seat-meter-label">
              <span>Seats Remaining:</span>
              <span class="${session.seats_remaining === 0 ? 'seats-count-full' : 'seats-count-avail'}">
                ${session.seats_remaining} / ${session.capacity}
              </span>
            </div>
            <div class="seat-meter-bar" role="progressbar" aria-valuenow="${session.confirmed_count}" aria-valuemin="0" aria-valuemax="20">
              <div class="seat-meter-fill ${isCardFull ? 'meter-full' : ''}" style="width: ${fillPercent}%;"></div>
            </div>
          </div>

          ${isStarted ? '<div class="session-tag tag-started">Session closed</div>' : ''}
          ${session.user_is_booked ? '<div class="session-tag tag-booked">✓ Confirmed Booking</div>' : ''}
          ${session.user_is_waitlisted ? '<div class="session-tag tag-waitlist">⏳ In Waitlist Queue</div>' : ''}

          <div class="session-actions" id="action-box-${session.id}">
            ${actionHtml}
          </div>
        </div>
      `;
    })
    .join('');
}

// Instant Optimistic Booking
async function handleBookSlot(sessionId) {
  if (state.isActionInFlight) return;

  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;

  // Snapshot before change
  const previousState = JSON.parse(JSON.stringify(state.sessions));

  // 1. Optimistic update
  session.confirmed_count++;
  session.seats_remaining = Math.max(0, session.capacity - session.confirmed_count);
  session.is_full = session.seats_remaining === 0;
  session.user_is_booked = true;

  state.isActionInFlight = true;
  renderSessionsGrid();

  const actionBox = document.getElementById(`action-box-${sessionId}`);
  if (actionBox) {
    actionBox.innerHTML = `<button type="button" class="btn btn-primary btn-block" disabled>Booking Slot...</button>`;
  }

  try {
    const data = await api('/bookings', 'POST', { session_id: sessionId });
    showToast(`🎉 Slot booked! Your check-in code is "${data.booking.checkin_code}"`);
    await loadSessions(true);
  } catch (err) {
    // Rollback state if server refused
    state.sessions = previousState;
    renderSessionsGrid();
    showToast(`Booking failed: ${err.message}`, 'error');
  } finally {
    state.isActionInFlight = false;
  }
}

async function handleJoinWaitlist(sessionId) {
  if (state.isActionInFlight) return;
  state.isActionInFlight = true;

  try {
    const data = await api('/waitlist', 'POST', { session_id: sessionId });
    showToast(`Joined waitlist! You are position #${data.waitlist.position} in line.`);
    await loadSessions(true);
  } catch (err) {
    showToast(`Could not join waitlist: ${err.message}`, 'error');
  } finally {
    state.isActionInFlight = false;
  }
}

function startSessionsPolling() {
  if (state.pollingInterval) clearInterval(state.pollingInterval);
  state.pollingInterval = setInterval(() => {
    if (state.currentRoute === '/sessions') {
      loadSessions(true);
    }
  }, 5000);
}

function initSessionsFilter() {
  const dateInput = document.getElementById('filter-date');
  const btnClear = document.getElementById('btn-date-clear');

  dateInput.addEventListener('change', (e) => {
    state.selectedDate = e.target.value;
    btnClear.style.display = state.selectedDate ? 'inline-block' : 'none';
    loadSessions();
  });

  const setDaysAhead = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toISOString().split('T')[0];
    dateInput.value = dateStr;
    state.selectedDate = dateStr;
    btnClear.style.display = 'inline-block';
    loadSessions();
  };

  document.getElementById('btn-date-today').addEventListener('click', () => setDaysAhead(0));
  document.getElementById('btn-date-tomorrow').addEventListener('click', () => setDaysAhead(1));
  document.getElementById('btn-date-dayafter').addEventListener('click', () => setDaysAhead(2));

  btnClear.addEventListener('click', () => {
    dateInput.value = '';
    state.selectedDate = '';
    btnClear.style.display = 'none';
    loadSessions();
  });

  document.getElementById('btn-sessions-retry').addEventListener('click', () => loadSessions());
}

// --- PAGE 3: MY BOOKINGS ---
async function loadMyBookings() {
  const loading = document.getElementById('bookings-loading');
  const errorAlert = document.getElementById('bookings-error');
  const emptyBox = document.getElementById('bookings-empty');
  const bookingsList = document.getElementById('bookings-list');
  const waitlistGrid = document.getElementById('waitlist-grid');
  const waitlistEmpty = document.getElementById('waitlist-empty');

  loading.style.display = 'flex';
  errorAlert.style.display = 'none';

  try {
    const [bookingsData, waitlistData] = await Promise.all([
      api('/bookings/my'),
      api('/waitlist/my')
    ]);

    const bookings = bookingsData.bookings || [];
    const waitlists = waitlistData.waitlist || [];

    if (bookings.length === 0) {
      emptyBox.style.display = 'block';
      bookingsList.innerHTML = '';
    } else {
      emptyBox.style.display = 'none';
      bookingsList.innerHTML = bookings
        .map((b) => {
          const isCancelled = b.status === 'cancelled';
          const canCancel = !isCancelled && !b.has_started;

          return `
            <div class="booking-card ${isCancelled ? 'card-cancelled' : ''} ${b.attended ? 'card-attended' : ''}">
              <div class="booking-info">
                <div class="booking-time-line">
                  <span>📅 ${b.session_date}</span>
                  <span>⏰ ${formatHour(b.start_hour)}</span>
                </div>
                <div>
                  ${
                    isCancelled
                      ? '<span class="status-badge status-cancelled">Cancelled</span>'
                      : b.attended
                      ? '<span class="status-badge status-attended">✓ Checked In (Present)</span>'
                      : b.has_started
                      ? '<span class="status-badge status-started">In Session / Ended</span>'
                      : '<span class="status-badge status-confirmed">Confirmed Booking</span>'
                  }
                </div>
              </div>

              ${
                !isCancelled
                  ? `
                <div class="code-display-box">
                  <span class="code-label">Check-in Code</span>
                  <div class="code-value-row">
                    <span class="code-value">${b.checkin_code}</span>
                    <button type="button" class="btn btn-outline btn-xs" onclick="copyCode('${b.checkin_code}')">Copy</button>
                  </div>
                  <span class="code-note">Show to staff at the door</span>
                </div>
              `
                  : ''
              }

              <div class="booking-actions">
                ${
                  canCancel
                    ? `<button type="button" class="btn btn-outline-danger btn-sm" onclick="cancelBooking(${b.id})">Cancel Booking</button>`
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('');
    }

    if (waitlists.length === 0) {
      waitlistEmpty.style.display = 'block';
      waitlistGrid.innerHTML = '';
    } else {
      waitlistEmpty.style.display = 'none';
      waitlistGrid.innerHTML = waitlists
        .map((w) => `
          <div class="waitlist-card">
            <div>
              <div style="font-weight: 600;">📅 ${w.session_date} — ⏰ ${formatHour(w.start_hour)}</div>
              <div class="waitlist-pos-badge">Waitlist Position: <strong>#${w.position}</strong></div>
              <p class="waitlist-hint">If a booked member cancels, you will be automatically booked with a code.</p>
            </div>
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="leaveWaitlist(${w.session_id})">Leave Waitlist</button>
          </div>
        `)
        .join('');
    }
  } catch (err) {
    errorAlert.style.display = 'flex';
    document.getElementById('bookings-error-text').textContent = err.message || 'Failed to load bookings';
  } finally {
    loading.style.display = 'none';
  }
}

async function cancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this booking? If there is a waitlist, the next person will receive your seat.')) {
    return;
  }

  try {
    const data = await api(`/bookings/${bookingId}/cancel`, 'POST');
    showToast(data.message || 'Booking cancelled successfully.');
    loadMyBookings();
  } catch (err) {
    showToast(`Cancellation failed: ${err.message}`, 'error');
  }
}

async function leaveWaitlist(sessionId) {
  try {
    const data = await api(`/waitlist/${sessionId}/leave`, 'POST');
    showToast(data.message || 'Left waitlist.');
    loadMyBookings();
  } catch (err) {
    showToast(`Could not leave waitlist: ${err.message}`, 'error');
  }
}

function copyCode(code) {
  navigator.clipboard.writeText(code);
  showToast(`Code "${code}" copied to clipboard!`);
}

// --- PAGE 4: ADMIN DESK ---
function initAdminPage() {
  populateHoursDropdown();
  loadAdminSessions();
  setupAdminForms();
}

function populateHoursDropdown() {
  const select = document.getElementById('create-hour');
  select.innerHTML = Array.from({ length: 24 })
    .map((_, i) => `<option value="${i}" ${i === 9 ? 'selected' : ''}>${formatHour(i)}</option>`)
    .join('');

  const d = new Date();
  d.setDate(d.getDate() + 1);
  document.getElementById('create-date').value = d.toISOString().split('T')[0];
}

async function loadAdminSessions() {
  const select = document.getElementById('select-admin-session');
  try {
    const data = await api('/sessions');
    const sessions = data.sessions || [];

    if (sessions.length === 0) {
      select.innerHTML = `<option value="">No sessions available</option>`;
      return;
    }

    select.innerHTML = sessions
      .map(
        (s) =>
          `<option value="${s.id}">${s.session_date} — ${formatHour(s.start_hour)} (${s.confirmed_count}/${s.capacity} Booked)</option>`
      )
      .join('');

    loadAdminSessionBookings(select.value);
  } catch (err) {
    console.error('Failed to load admin sessions:', err);
  }
}

async function loadAdminSessionBookings(sessionId) {
  if (!sessionId) return;

  const loading = document.getElementById('admin-bookings-loading');
  const empty = document.getElementById('admin-bookings-empty');
  const tableWrapper = document.getElementById('admin-bookings-table-wrapper');
  const tbody = document.getElementById('admin-bookings-tbody');

  loading.style.display = 'flex';
  empty.style.display = 'none';
  tableWrapper.style.display = 'none';

  try {
    const data = await api(`/bookings/session/${sessionId}`);
    const bookings = data.bookings || [];

    if (bookings.length === 0) {
      empty.style.display = 'block';
    } else {
      tbody.innerHTML = bookings
        .map((b, idx) => `
          <tr class="${b.status === 'cancelled' ? 'row-cancelled' : ''}">
            <td>${idx + 1}</td>
            <td style="font-weight: 600;">${b.user_name}</td>
            <td style="color: var(--text-muted);">${b.user_email}</td>
            <td><code class="code-badge">${b.checkin_code}</code></td>
            <td><span class="status-badge status-${b.status}">${b.status}</span></td>
            <td>
              ${
                b.attended
                  ? `<span class="status-badge status-attended">✓ Present (${new Date(b.attended_at).toLocaleTimeString()})</span>`
                  : '<span class="status-badge status-unattended">Not Yet</span>'
              }
            </td>
          </tr>
        `)
        .join('');
      tableWrapper.style.display = 'block';
    }
  } catch (err) {
    showToast(`Failed to load session bookings: ${err.message}`, 'error');
  } finally {
    loading.style.display = 'none';
  }
}

function setupAdminForms() {
  const formCheckin = document.getElementById('form-checkin');
  const inputCode = document.getElementById('input-checkin-code');
  const checkinError = document.getElementById('checkin-error-alert');
  const checkinSuccess = document.getElementById('checkin-success-card');
  const btnCheckin = document.getElementById('btn-checkin-submit');

  inputCode.addEventListener('input', () => {
    inputCode.value = inputCode.value.toUpperCase();
    document.getElementById('error-checkin-code').textContent = '';
  });

  formCheckin.onsubmit = async (e) => {
    e.preventDefault();
    const code = inputCode.value.trim().toUpperCase();

    if (!code || code.length !== 6) {
      document.getElementById('error-checkin-code').textContent = 'Code must be exactly 6 characters';
      return;
    }

    btnCheckin.disabled = true;
    btnCheckin.textContent = 'Verifying...';
    checkinError.style.display = 'none';
    checkinSuccess.style.display = 'none';

    try {
      const data = await api('/checkin', 'POST', { code });
      document.getElementById('checkin-res-name').textContent = data.booking.member_name;
      document.getElementById('checkin-res-email').textContent = data.booking.member_email;
      document.getElementById('checkin-res-session').textContent = `${data.booking.session_date} at ${formatHour(data.booking.start_hour)}`;
      checkinSuccess.style.display = 'flex';
      inputCode.value = '';

      const select = document.getElementById('select-admin-session');
      if (select.value) loadAdminSessionBookings(select.value);
    } catch (err) {
      checkinError.style.display = 'flex';
      document.getElementById('checkin-error-text').textContent = err.message;
    } finally {
      btnCheckin.disabled = false;
      btnCheckin.textContent = 'Check In';
    }
  };

  const formCreate = document.getElementById('form-create-session');
  const inputDate = document.getElementById('create-date');
  const selectHour = document.getElementById('create-hour');
  const createSuccess = document.getElementById('create-session-success');
  const createError = document.getElementById('create-session-error');
  const btnCreate = document.getElementById('btn-create-session');

  formCreate.onsubmit = async (e) => {
    e.preventDefault();
    const session_date = inputDate.value;
    const start_hour = Number(selectHour.value);

    if (!session_date) {
      document.getElementById('error-create-date').textContent = 'Please choose a date';
      return;
    }

    btnCreate.disabled = true;
    btnCreate.textContent = 'Creating...';
    createSuccess.style.display = 'none';
    createError.style.display = 'none';

    try {
      const data = await api('/sessions', 'POST', { session_date, start_hour });
      createSuccess.style.display = 'flex';
      document.getElementById('create-session-success-text').textContent = `Created session for ${data.session.session_date} at ${formatHour(data.session.start_hour)}!`;
      await loadAdminSessions();
    } catch (err) {
      createError.style.display = 'flex';
      document.getElementById('create-session-error-text').textContent = err.message;
    } finally {
      btnCreate.disabled = false;
      btnCreate.textContent = 'Create Session';
    }
  };

  document.getElementById('select-admin-session').addEventListener('change', (e) => {
    loadAdminSessionBookings(e.target.value);
  });
}

// --- INIT APP ---
window.addEventListener('DOMContentLoaded', async () => {
  await window.ServerAPI.init();
  initAuth();
  initSessionsFilter();
  window.addEventListener('hashchange', handleRouting);
  handleRouting();
});
