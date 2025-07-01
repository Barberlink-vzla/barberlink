// js/auth.js

// La variable global `supabaseClient` es inicializada por `js/supabaseClient.js`
// y se asume que ya está disponible cuando este script se ejecuta.

// Elementos del DOM
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const authStatus = document.getElementById('auth-status');

// Elementos de la UI de tarjeta flip
const flipCardContainer = document.getElementById('flipCard');
const authFormsStatusContainer = document.getElementById('auth-forms-status-container');

// Elementos del Overlay de Notificación
const notificationOverlay = document.getElementById('notification-overlay');
const notificationBox = document.querySelector('.notification-overlay .notification-box');
const notificationTitle = document.getElementById('notification-title');
const notificationMessage = document.getElementById('notification-message');
const notificationCloseBtn = document.getElementById('notification-close-btn');


/**
 * Inicializa el módulo de autenticación.
 */
function initAuthModule() {
    // Verificar que el cliente de Supabase esté disponible
    if (typeof supabaseClient === 'undefined') {
        console.error("Auth Error: supabaseClient no está definido. Asegúrate de que `supabaseClient.js` se cargue antes que `auth.js`.");
        showNotification('Error Crítico', 'El servicio de autenticación no pudo cargarse. Refresca la página.', 'error');
        return;
    }
    
    console.log("Módulo de autenticación iniciado correctamente. ✅");

    updateAuthUI();
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Cambio en estado de autenticación:', event, session);
        updateAuthUI();
    });
}


/**
 * Muestra una notificación en pantalla.
 * @param {string} title - El título de la notificación.
 * @param {string} message - El mensaje de la notificación (puede contener HTML básico como <br>, <strong>).
 * @param {'success'|'error'|'info'} type - El tipo de notificación.
 */
function showNotification(title, message, type = 'info') {
    if (notificationOverlay && notificationTitle && notificationMessage && notificationCloseBtn && notificationBox) {
        notificationTitle.textContent = title;
        notificationMessage.innerHTML = message; // Usar innerHTML para permitir etiquetas básicas

        // Resetear clases de tipo
        notificationBox.classList.remove('success', 'error', 'info');

        // Aplicar clase de tipo
        if (type === 'success') {
            notificationBox.classList.add('success');
        } else if (type === 'error') {
            notificationBox.classList.add('error');
        } else {
            notificationBox.classList.add('info'); // Para un estilo 'info' si se define
        }

        notificationOverlay.classList.add('show');
    } else {
        console.warn("Elementos de notificación no encontrados. Mostrando alerta fallback.");
        // Fallback si los elementos del overlay no están disponibles
        const alertMessage = `${title}\n\n${message.replace(/<br\s*\/?>/gi, '\n').replace(/<strong>(.*?)<\/strong>/gi, '$1')}`;
        alert(alertMessage);
    }
}

// Event Listener para cerrar el overlay de notificación
if (notificationCloseBtn) {
    notificationCloseBtn.addEventListener('click', () => {
        if (notificationOverlay) {
            notificationOverlay.classList.remove('show');
        }
    });
}

async function updateAuthUI() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        if (authStatus) authStatus.textContent = `Sesión iniciada como: ${user.email}`;
        if (logoutButton) logoutButton.style.display = 'block';
        if (flipCardContainer) flipCardContainer.style.display = 'none';
        if (authFormsStatusContainer) authFormsStatusContainer.style.display = 'block';

        if (window.location.pathname.endsWith('login_register.html')) {
            window.location.href = 'barber_profile.html';
        }
    } else {
        if (authStatus) authStatus.textContent = '';
        if (logoutButton) logoutButton.style.display = 'none';
        if (flipCardContainer) flipCardContainer.style.display = 'block';
        if (authFormsStatusContainer) authFormsStatusContainer.style.display = 'none';
    }
}

// Event Listener para el registro
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        if (authStatus) authStatus.textContent = 'Registrando...';

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (authStatus) authStatus.textContent = '';

        if (error) {
            showNotification('Error de Registro', `No pudimos completar tu registro.<br>Detalle: ${error.message}`, 'error');
            console.error('Error de registro:', error.message);
        } else if (data.user) {
            if (data.user.identities && data.user.identities.length === 0 && !data.session) {
                showNotification('Verificación Pendiente', `Ya existe una cuenta con <strong>${email}</strong> pendiente de confirmación.<br>Revisa tu correo para activar la cuenta.`, 'info');
            } else if (data.session === null && !data.user.email_verified) {
                showNotification('¡Revisa tu Correo!', `Hemos enviado un correo de confirmación a <strong>${email}</strong>.<br>Activa tu cuenta para continuar.`, 'success');
            } else if (data.session) {
                showNotification('¡Registro Exitoso!', 'Serás redirigido en breve.', 'success');
            } else {
                showNotification('Registro Completado', `Tu cuenta para <strong>${email}</strong> ha sido creada.`, 'info');
            }
            if (registerForm) registerForm.reset();
        } else {
            showNotification('Error Inesperado', 'Ocurrió un problema durante el registro.', 'error');
            console.error('Respuesta inesperada del signUp:', data);
        }
    });
}

// Event Listener para el inicio de sesión
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (authStatus) authStatus.textContent = 'Iniciando sesión...';

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (authStatus) authStatus.textContent = '';

        if (error) {
            let friendlyMessage = `No pudimos iniciar tu sesión.<br>Detalle: ${error.message}`;
            if (error.message.toLowerCase().includes('invalid login credentials')) {
                friendlyMessage = 'El correo o la contraseña son incorrectos.';
            } else if (error.message.toLowerCase().includes('email not confirmed')) {
                friendlyMessage = `Tu correo no ha sido confirmado.<br>Busca el correo de activación en tu bandeja de entrada. <button id="resend-confirmation-btn" data-email="${email}" class="link-button">Reenviar correo</button>`;
            }
            showNotification('Error de Inicio de Sesión', friendlyMessage, 'error');
            console.error('Error de login:', error.message);

            const resendBtn = document.getElementById('resend-confirmation-btn');
            if (resendBtn) {
                resendBtn.addEventListener('click', async (event) => {
                    const emailToResend = event.target.dataset.email;
                    if (authStatus) authStatus.textContent = `Reenviando...`;
                    
                    const { error: resendError } = await supabaseClient.auth.resend({ type: 'signup', email: emailToResend });

                    if (authStatus) authStatus.textContent = '';
                    
                    if (resendError) {
                        showNotification('Error al Reenviar', `No se pudo reenviar.<br>Detalle: ${resendError.message}`, 'error');
                    } else {
                        showNotification('Correo Reenviado', `Se envió un nuevo correo a <strong>${emailToResend}</strong>.`, 'success');
                    }
                });
            }

        } else {
            console.log('Usuario logueado:', data.user);
            if (loginForm) loginForm.reset();
        }
    });
}

// Event Listener para cerrar sesión
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            showNotification('Error', `Error al cerrar sesión: ${error.message}`, 'error');
            console.error('Error de logout:', error.message);
        } else {
            console.log('Sesión cerrada');
            if (!window.location.pathname.endsWith('login_register.html')) {
                 window.location.href = 'login_register.html';
            }
        }
    });
}

// CSS para el botón de reenviar
const style = document.createElement('style');
style.textContent = `
    .link-button {
        background: none; border: none; color: var(--login-primary-accent);
        text-decoration: underline; cursor: pointer; padding: 0;
        font-size: inherit; font-family: inherit;
    }
    .link-button:hover { color: var(--accent-hover-color); }
`;
document.head.appendChild(style);

// Inicializar el módulo cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initAuthModule);
