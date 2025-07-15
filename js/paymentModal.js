// REEMPLAZA TODO EL CONTENIDO DE js/paymentModal.js CON ESTO

// Estado y elementos del DOM para el modal de pago
let currentCitaForPayment = null;
const paymentOverlay = document.getElementById('payment-modal-overlay');
const paymentModal = document.getElementById('payment-modal');
const paymentForm = document.getElementById('payment-form');
const paymentCloseBtn = document.getElementById('payment-modal-close-btn');
const paymentClientName = document.getElementById('payment-client-name');
const paymentAmount = document.getElementById('payment-amount');
const paymentCitaIdInput = document.getElementById('payment-cita-id');
const deadlineContainer = document.getElementById('payment-deadline-container');
const deadlineInput = document.getElementById('payment-deadline-date');
const paymentStatusMessage = document.getElementById('payment-status-message');

// --- NUEVOS ELEMENTOS ---
const cashOptionsContainer = document.getElementById('cash-payment-options');
const payCashUsdBtn = document.getElementById('pay-cash-usd-btn');
const payCashVesBtn = document.getElementById('pay-cash-ves-btn');
const savePaymentBtn = document.getElementById('save-payment-btn');

/**
 * Muestra el modal de pago y lo puebla con los datos de la cita.
 * @param {object} cita - El objeto de la cita a pagar.
 */
function showPaymentModal(cita) {
    if (!paymentOverlay || !cita) {
        console.error("No se pudo mostrar el modal de pago. Faltan elementos o datos.");
        return;
    }

    currentCitaForPayment = cita;
    paymentClientName.textContent = cita.cliente_nombre;

    const precioFinal = cita.precio_final ?? 0;
    // Usamos el currencyManager global para mostrar el precio en ambas monedas
    paymentAmount.innerHTML = currencyManager.formatPrice(precioFinal);
    
    paymentCitaIdInput.value = cita.id;

    // Resetear el formulario a su estado inicial
    paymentForm.reset();
    paymentStatusMessage.textContent = '';
    paymentStatusMessage.className = 'status-message';
    
    // Ocultar todos los botones de acción al inicio
    cashOptionsContainer.style.display = 'none';
    savePaymentBtn.style.display = 'none';
    deadlineContainer.style.display = 'none';
    
    // Forzar la selección por defecto y disparar el evento de cambio
    document.getElementById('pay-efectivo').checked = true;
    handlePaymentMethodChange();

    paymentOverlay.classList.add('active');
}

/**
 * Cierra el modal de pago.
 */
function closePaymentModal() {
    if (paymentOverlay) {
        paymentOverlay.classList.remove('active');
    }
    currentCitaForPayment = null;
}

/**
 * Maneja el cambio en el método de pago seleccionado.
 */
function handlePaymentMethodChange() {
    const selectedMethod = paymentForm.querySelector('input[name="metodo_pago"]:checked').value;

    // Ocultar todo por defecto
    cashOptionsContainer.style.display = 'none';
    savePaymentBtn.style.display = 'none';
    deadlineContainer.style.display = 'none';
    paymentStatusMessage.textContent = ''; // Limpiar mensajes

    const precioFinal = currentCitaForPayment.precio_final ?? 0;

    if (selectedMethod === 'efectivo') {
        cashOptionsContainer.style.display = 'block';
    } else if (selectedMethod === 'no_pagado') {
        savePaymentBtn.style.display = 'block';
        savePaymentBtn.innerHTML = '<i class="fas fa-user-clock"></i> Registrar Deuda y Finalizar';
        deadlineContainer.style.display = 'block';
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deadlineInput.value = tomorrow.toISOString().split('T')[0];
    } else { // Transferencia o Pago Móvil
        savePaymentBtn.style.display = 'block';
        savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Pago y Finalizar';
        // Mostrar el monto en Bolívares
        paymentStatusMessage.textContent = `Monto a registrar en ${currencyManager.secondaryCurrency}: ${currencyManager.getSecondaryValueText(precioFinal)}`;
        paymentStatusMessage.className = 'status-message info';
    }
}

/**
 * Maneja el guardado de la información de pago.
 * @param {Event} e - El evento de envío del formulario.
 */

async function handleSavePayment(e) {
    e.preventDefault();
    if (!currentCitaForPayment) return;

    const paymentMethod = paymentForm.querySelector('input[name="metodo_pago"]:checked').value;
    let detailedPaymentMethod = e.target.dataset.method || paymentMethod;

    savePaymentBtn.disabled = true;
    payCashUsdBtn.disabled = true;
    payCashVesBtn.disabled = true;
    
    const spinner = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    if (savePaymentBtn.style.display !== 'none') savePaymentBtn.innerHTML = spinner;
    
    paymentStatusMessage.textContent = 'Procesando...';
    paymentStatusMessage.className = 'status-message processing';

    // --- INICIO DE LA NUEVA LÓGICA ---
    const esDeuda = (detailedPaymentMethod === 'no_pagado');
    const fechaLimite = esDeuda ? deadlineInput.value : null;

    if (esDeuda && !fechaLimite) {
        alert('Por favor, establece una fecha límite para el pago.');
        resetButtons();
        return;
    }

    // Inicializamos los montos
    let monto_usd = 0;
    let monto_ves = 0;
    const precioBaseUSD = currentCitaForPayment.precio_final || 0;

    if (!esDeuda) {
        // Determinamos qué columna llenar basado en el método de pago
        if (detailedPaymentMethod === 'efectivo_usd') {
            monto_usd = precioBaseUSD;
        } else { // Para efectivo_ves, transferencia, pago_movil
            // Calculamos el monto en VES y lo guardamos
            monto_ves = precioBaseUSD * currencyManager.finalRate;
        }
    }
    
    // El objeto que se enviará a la base de datos
    const updateData = {
        estado: 'completada',
        metodo_pago: detailedPaymentMethod,
        estado_pago: esDeuda ? 'pendiente' : 'pagado',
        fecha_limite_pago: fechaLimite,
        monto_recibido_usd: monto_usd, // <-- NUEVO
        monto_recibido_ves: monto_ves  // <-- NUEVO
        // precio_final se mantiene intacto en USD como referencia
    };
    // --- FIN DE LA NUEVA LÓGICA ---

    try {
        const { error } = await supabaseClient
            .from('citas')
            .update(updateData)
            .eq('id', currentCitaForPayment.id);

        if (error) throw error;

        document.dispatchEvent(new CustomEvent('paymentProcessed', {
            detail: { citaId: currentCitaForPayment.id }
        }));
        
        paymentStatusMessage.textContent = '¡Operación registrada con éxito! La cita ha sido finalizada.';
        paymentStatusMessage.className = 'status-message success';
        
        setTimeout(closePaymentModal, 2000);

    } catch (error) {
        console.error('Error al guardar el pago:', error);
        paymentStatusMessage.textContent = `Error: ${error.message}`;
        paymentStatusMessage.className = 'status-message error';
        resetButtons();
    }
}

function resetButtons() {
    savePaymentBtn.disabled = false;
    payCashUsdBtn.disabled = false;
    payCashVesBtn.disabled = false;
    handlePaymentMethodChange(); // Restaura el texto original de los botones
}

/**
 * Configura todos los listeners de eventos para el modal de pago.
 */
function setupPaymentModalListeners() {
    if (!paymentForm) return;

    // El submit del formulario ahora es manejado por los botones directamente
    paymentForm.addEventListener('submit', handleSavePayment);

    // Los botones de efectivo ahora disparan el guardado
    payCashUsdBtn.addEventListener('click', (e) => {
        e.target.dataset.method = 'efectivo_usd';
        handleSavePayment(e);
    });
    payCashVesBtn.addEventListener('click', (e) => {
        e.target.dataset.method = 'efectivo_ves';
        handleSavePayment(e);
    });

    if (paymentCloseBtn) paymentCloseBtn.addEventListener('click', closePaymentModal);
    if (paymentOverlay) paymentOverlay.addEventListener('click', (e) => {
        if (e.target === paymentOverlay) closePaymentModal();
    });

    // Listener para mostrar/ocultar campos según el método de pago
    paymentForm.querySelectorAll('input[name="metodo_pago"]').forEach(radio => {
        radio.addEventListener('change', handlePaymentMethodChange);
    });
}

// Inicializar los listeners al cargar
document.addEventListener('DOMContentLoaded', setupPaymentModalListeners);
