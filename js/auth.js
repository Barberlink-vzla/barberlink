// js/auth.js

// La variable global `supabaseClient` es inicializada por `js/supabaseClient.js`
// y se asume que ya está disponible cuando este script se ejecuta.

// Elementos del DOM
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const authStatus = document.getElementById('auth-status');

// --- NUEVOS ELEMENTOS ---
const forgotPasswordLink = document.getElementById('forgot-password-link');
const passwordResetForm = document.getElementById('password-reset-form');
const passwordResetContainer = document.getElementById('password-reset-container');
// --- FIN NUEVOS ELEMENTOS ---

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
    if (typeof supabaseClient === 'undefined') {
        console.error("Auth Error: supabaseClient no está definido. Asegúrate de que `supabaseClient.js` se cargue antes que `auth.js`.");
        showNotification('Error Crítico', 'El servicio de autenticación no pudo cargarse. Refresca la página.', 'error');
        return;
    }
    
    console.log("Módulo de autenticación iniciado correctamente. ✅");

    // MODIFICADO: Ahora el listener gestiona el estado de recuperación de contraseña.
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('Cambio en estado de autenticación:', event, session);

        // --- LÓGICA CLAVE PARA LA RECUPERACIÓN ---
        if (event === 'PASSWORD_RECOVERY') {
            console.log('Modo de recuperación de contraseña detectado.');
            // Ocultamos el formulario de login/registro y mostramos el de nueva contraseña.
            if(flipCardContainer) flipCardContainer.style.display = 'none';
            if(passwordResetContainer) passwordResetContainer.style.display = 'block';
        } else {
             // Si no es recuperación, volvemos a la vista normal y actualizamos la UI.
            if(flipCardContainer) flipCardContainer.style.display = 'block';
            if(passwordResetContainer) passwordResetContainer.style.display = 'none';
            await updateAuthUI(session);
        }
    });
}


/**
 * Muestra una notificación en pantalla.
 * @param {string} title - El título de la notificación.
 * @param {string} message - El mensaje de la notificación (puede contener HTML básico).
 * @param {'success'|'error'|'info'} type - El tipo de notificación.
 */
function showNotification(title, message, type = 'info') {
    if (notificationOverlay && notificationTitle && notificationMessage && notificationCloseBtn && notificationBox) {
        notificationTitle.textContent = title;
        notificationMessage.innerHTML = message; 

        notificationBox.classList.remove('success', 'error', 'info');

        if (type === 'success') notificationBox.classList.add('success');
        else if (type === 'error') notificationBox.classList.add('error');
        else notificationBox.classList.add('info');

        notificationOverlay.classList.add('show');
    } else {
        console.warn("Elementos de notificación no encontrados. Mostrando alerta fallback.");
        const alertMessage = `${title}\n\n${message.replace(/<br\s*\/?>/gi, '\n').replace(/<strong>(.*?)<\/strong>/gi, '$1')}`;
        alert(alertMessage);
    }
}

if (notificationCloseBtn) {
    notificationCloseBtn.addEventListener('click', () => {
        if (notificationOverlay) notificationOverlay.classList.remove('show');
    });
}

// MODIFICADO: Ahora la función recibe la sesión para evitar llamadas extra.
async function updateAuthUI(session) {
    const user = session?.user;

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

// Event Listener para el registro (sin cambios)
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        if (authStatus) authStatus.textContent = 'Registrando...';

        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (authStatus) authStatus.textContent = '';

        if (error) {
            showNotification('Error de Registro', `No pudimos completar tu registro.<br>Detalle: ${error.message}`, 'error');
            console.error('Error de registro:', error.message);
        } else if (data.user) {
            
            const { error: profileError } = await supabaseClient
                .from('barberos')
                .insert({ user_id: data.user.id, nombre: data.user.email, telefono: 'No especificado' });

            if (profileError) {
                console.error('Error creando el perfil del barbero:', profileError);
                showNotification('Error Crítico', 'Tu cuenta fue creada, pero no pudimos inicializar tu perfil. Por favor, contacta a soporte.', 'error');
                return;
            }

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

// Event Listener para el inicio de sesión (sin cambios)
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (authStatus) authStatus.textContent = 'Iniciando sesión...';

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

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

// Event Listener para cerrar sesión (sin cambios)
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


// --- NUEVO: EVENT LISTENER PARA EL ENLACE DE "OLVIDÉ MI CONTRASEÑA" ---
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;

        if (!email) {
            showNotification('Falta Email', 'Por favor, introduce tu correo electrónico en el campo de email para poder restablecer la contraseña.', 'error');
            return;
        }

        // Esta es la función de Supabase para enviar el correo de recuperación.
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            // Es crucial indicar a dónde debe redirigir al usuario después de hacer clic en el enlace del correo.
            redirectTo: window.location.origin + window.location.pathname,
        });

        if (error) {
            showNotification('Error', `No se pudo enviar el correo: ${error.message}`, 'error');
        } else {
            // Por seguridad, no confirmamos si el correo existe o no.
            showNotification('Correo Enviado', 'Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña en breve.', 'success');
        }
    });
}


// --- NUEVO: EVENT LISTENER PARA EL FORMULARIO DE RESTABLECIMIENTO DE CONTRASEÑA ---
if (passwordResetForm) {
    passwordResetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new-password').value;

        if (!newPassword || newPassword.length < 6) {
            showNotification('Contraseña Inválida', 'La contraseña debe tener al menos 6 caracteres.', 'error');
            return;
        }

        // Cuando el usuario está en modo "PASSWORD_RECOVERY", esta función actualiza su contraseña.
        const { data, error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) {
            showNotification('Error', `No se pudo actualizar la contraseña: ${error.message}`, 'error');
        } else {
            showNotification('¡Éxito!', 'Tu contraseña ha sido actualizada correctamente. Serás redirigido al panel.', 'success');
            // La lógica de `onAuthStateChange` y `updateAuthUI` se encargará de la redirección automática.
            if(passwordResetForm) passwordResetForm.reset();

            // Forzamos una actualización de la UI para que detecte la nueva sesión y redirija
            setTimeout(async () => {
               const { data: { session } } = await supabaseClient.auth.getSession();
               await updateAuthUI(session);
            }, 1500);
        }
    });
}

// CSS para el botón de reenviar (sin cambios)
const style = document.createElement('style');
style.textContent = `
    .link-button { background: none; border: none; color: var(--login-primary-accent); text-decoration: underline; cursor: pointer; padding: 0; font-size: inherit; font-family: inherit; }
    .link-button:hover { color: var(--accent-hover-color); }
`;
document.head.appendChild(style);

// Inicializar el módulo cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initAuthModule);
