

document.addEventListener('DOMContentLoaded', () => {
    // Eliminamos la variable local `currentBarberId`. Usaremos la que viene del evento.
    
    const clientListContainer = document.getElementById('client-list-container');
    const addClientForm = document.getElementById('add-client-form');
    
    function initClientModule() {
    if (typeof supabaseClient === 'undefined') {
        console.error("Clients Error: supabaseClient no está definido.");
        if(document.getElementById('client-list-container')) document.getElementById('client-list-container').innerHTML = '<p class="error-msg">Error crítico de conexión.</p>';
        return;
    }
    console.log("Módulo de clientes iniciado correctamente. ✅");

    let barberAuthId = null; // Variable local para guardar el ID de autenticación

    // 1. Escuchamos el evento 'profileReady' para obtener el ID de autenticación
    document.addEventListener('profileReady', (e) => {
        console.log("Evento 'profileReady' recibido en clientes.js. Cargando lista...");
        barberAuthId = e.detail.authId; // Obtenemos y guardamos el ID de autenticación
        
        if (barberAuthId) {
            fetchAndRenderClients(barberAuthId); // Cargamos los clientes con el ID correcto
        } else {
            console.error("No se recibió el authId en el evento 'profileReady'.");
        }
    });
    
    // 2. El listener de 'clientListChanged' ahora usa la variable local segura
    document.addEventListener('clientListChanged', () => {
        console.log("Evento 'clientListChanged' detectado en clientes.js. Refrescando la lista...");
        if (barberAuthId) {
            fetchAndRenderClients(barberAuthId); // Refrescamos la lista con el ID correcto
        }
    });
    
    // 3. El formulario para añadir clientes también debe usar el ID correcto
    const addClientForm = document.getElementById('add-client-form');
    if (addClientForm) {
        addClientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!barberAuthId) {
                alert("Error: No se puede añadir el cliente. La identificación del barbero no está disponible. Recarga la página.");
                return;
            }
            // Lógica del formulario (la moveremos aquí o la llamaremos)
            await handleAddClient(e, barberAuthId);
        });
    }
}



    async function fetchAndRenderClients(authId) {
    const clientListContainer = document.getElementById('client-list-container');
    if (!authId || !clientListContainer) return;

    clientListContainer.innerHTML = '<p>Cargando clientes...</p>';
    
    // La llamada RPC ahora recibe el ID de autenticación
    const { data: clients, error } = await supabaseClient
        .rpc('get_clients_with_debt_status', { p_barbero_id: authId }); // <-- ID correcto usado aquí

    if (error) {
        console.error('Error cargando clientes:', error);
        clientListContainer.innerHTML = `<p class="error-msg">Error al cargar los clientes.</p>`;
        return;
    }

    if (!clients || clients.length === 0) {
        clientListContainer.innerHTML = '<p>Aún no tienes clientes registrados.</p>';
        return;
    }

    clientListContainer.innerHTML = '';
    clients.forEach(client => {
        clientListContainer.innerHTML += createClientCardHTML(client);
    });
}


    

    // ... (la función createClientCardHTML no necesita cambios) ...
    function createClientCardHTML(client) {
        const defaultPhoto = 'https://static.vecteezy.com/system/resources/previews/009/292/244/original/default-avatar-icon-of-social-media-user-vector.jpg';
        const photoUrl = client.foto_perfil_url || defaultPhoto;

        const debtAlertHTML = client.has_debt 
            ? `<div class="client-debt-alert"><i class="fas fa-exclamation-circle"></i> Pago pendiente</div>`
            : '';

        return `
            <div class="client-card ${client.has_debt ? 'has-debt' : ''}" id="client-card-${client.id}" data-client-id="${client.id}">
                ${debtAlertHTML}
                
                <div class="client-card-content">
                    <div class="client-photo">
                        <img src="${photoUrl}" alt="Foto de ${client.nombre}">
                        <input type="file" class="edit-client-photo-input" accept="image/*" style="display:none;">
                    </div>
                    <div class="client-details">
                        <div class="client-view-mode">
                            <h3 class="client-name">${client.nombre} ${client.apellido || ''}</h3>
                            <p class="client-phone"><i class="fas fa-phone"></i> ${client.telefono || 'No disponible'}</p>
                            <p class="client-topics-title">Temas de Conversación:</p>
                            <p class="client-topics-text">${client.temas_conversacion || 'Añade notas para conectar mejor.'}</p>
                        </div>
                        
                        <div class="client-edit-mode" style="display:none;">
                            <input type="text" class="edit-client-name" id="edit-client-name-${client.id}" name="client-name-${client.id}" value="${client.nombre}">
                            <input type="text" class="edit-client-lastname" id="edit-client-lastname-${client.id}" name="client-lastname-${client.id}" value="${client.apellido || ''}">
                            <input type="tel" class="edit-client-phone" id="edit-client-phone-${client.id}" name="client-phone-${client.id}" value="${client.telefono || ''}">
                            <textarea class="edit-client-topics" id="edit-client-topics-${client.id}" name="client-topics-${client.id}">${client.temas_conversacion || ''}</textarea>
                        </div>
                    </div>
                </div>

                <div class="client-actions">
                    <button class="client-action-btn edit-btn"><i class="fas fa-edit"></i> Editar</button>
                    <button class="client-action-btn save-btn" style="display:none;"><i class="fas fa-save"></i> Guardar</button>
                    <button class="client-action-btn delete-btn"><i class="fas fa-trash"></i></button>
                </div>
                
                <div class="client-card-overlay">
                    <div class="overlay-content">
                        <p class="progress-status-text">Iniciando...</p>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }


    /**
     * Configura los listeners de eventos para todo el módulo
     */
 function setupEventListeners() {
        if (addClientForm) {
            addClientForm.addEventListener('submit', handleAddClient);
        }

        if (clientListContainer) {
            clientListContainer.addEventListener('click', (e) => {
                const clientCard = e.target.closest('.client-card');
                if (!clientCard) return;

                const clientId = clientCard.dataset.clientId;

                if (e.target.closest('.edit-btn')) {
                    toggleEditMode(clientCard, true);
                }
                if (e.target.closest('.save-btn')) {
                    handleSaveClient(clientId);
                }
                if (e.target.closest('.delete-btn')) {
                    handleDeleteClient(clientId);
                }
                if (clientCard.classList.contains('is-editing') && e.target.closest('.client-photo img')) {
                    clientCard.querySelector('.edit-client-photo-input').click();
                }
            });
        }
        
        document.addEventListener('clientListChanged', () => {
            console.log("Evento 'clientListChanged' detectado en clientes.js. Refrescando la lista...");
            fetchAndRenderClients();
        });
    }

    /**
     * Maneja el envío del formulario para añadir un nuevo cliente
     */
async function handleAddClient(e, barberAuthId) {
    const form = e.target;
    const newClient = {
        nombre: form.querySelector('#add-client-nombre').value,
        apellido: form.querySelector('#add-client-apellido').value,
        telefono: form.querySelector('#add-client-telefono').value,
        temas_conversacion: form.querySelector('#add-client-temas').value,
        barbero_id: barberAuthId // Usamos el ID de autenticación que recibimos
    };

    if (!newClient.nombre || !newClient.telefono) {
        alert("El nombre y el teléfono son obligatorios.");
        return;
    }

    const { error } = await supabaseClient.from('clientes').insert(newClient);

    if (error) {
        console.error("Error añadiendo cliente:", error);
        alert("Error al guardar el cliente. Es posible que el teléfono ya exista.");
        return;
    }

    // Disparamos el evento para notificar a todos los módulos que la lista cambió
    document.dispatchEvent(new CustomEvent('clientListChanged'));
    form.reset();
}
    
    
    /**
     * Activa o desactiva el modo de edición para una tarjeta de cliente
     */
    function toggleEditMode(clientCard, isEditing) {
        clientCard.classList.toggle('is-editing', isEditing);
        
        clientCard.querySelector('.client-view-mode').style.display = isEditing ? 'none' : 'block';
        clientCard.querySelector('.client-edit-mode').style.display = isEditing ? 'block' : 'none';
        clientCard.querySelector('.edit-btn').style.display = isEditing ? 'none' : 'inline-flex';
        clientCard.querySelector('.save-btn').style.display = isEditing ? 'inline-flex' : 'none';
        
        const debtAlert = clientCard.querySelector('.client-debt-alert');
        if(debtAlert) debtAlert.style.display = isEditing ? 'none' : 'flex';
        clientCard.querySelector('.delete-btn').style.display = isEditing ? 'none' : 'inline-flex';
    }

    /**
     * Guarda los cambios de un cliente
     */
    async function handleSaveClient(clientId) {
        const clientCard = document.getElementById(`client-card-${clientId}`);
        if (!clientCard) return;

        const saveBtn = clientCard.querySelector('.save-btn');
        const progressBar = clientCard.querySelector('.progress-bar-fill');
        const statusText = clientCard.querySelector('.progress-status-text');

        clientCard.classList.add('is-saving');
        progressBar.style.width = '0%';
        if (saveBtn) saveBtn.disabled = true;

        try {
            const updatedData = {
                nombre: clientCard.querySelector('.edit-client-name').value,
                apellido: clientCard.querySelector('.edit-client-lastname').value,
                telefono: clientCard.querySelector('.edit-client-phone').value,
                temas_conversacion: clientCard.querySelector('.edit-client-topics').value
            };

            const photoFile = clientCard.querySelector('.edit-client-photo-input').files[0];

            if (photoFile) {
                statusText.textContent = 'Optimizando imagen...';
                progressBar.style.width = '25%';
                
                const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true, initialQuality: 0.7 };
                const compressedFile = await imageCompression(photoFile, options);

                statusText.textContent = 'Subiendo foto...';
                progressBar.style.width = '50%';

                const filePath = `${currentBarberId}/${Date.now()}_${compressedFile.name}`;
                const { error: uploadError } = await supabaseClient.storage
                    .from('client-photos')
                    .upload(filePath, compressedFile, { upsert: true });

                if (uploadError) throw new Error('Error al subir la nueva foto: ' + uploadError.message);
                
                updatedData.foto_perfil_url = supabaseClient.storage.from('client-photos').getPublicUrl(filePath).data.publicUrl;
            }
            
            statusText.textContent = 'Guardando información...';
            progressBar.style.width = photoFile ? '85%' : '50%';

            const { data, error } = await supabaseClient
                .from('clientes')
                .update(updatedData)
                .eq('id', clientId)
                .select()
                .single();

            if (error) throw new Error("Error al guardar los datos del cliente: " + error.message);
            
            statusText.textContent = '¡Guardado con éxito!';
            progressBar.style.width = '100%';

            setTimeout(() => {
                clientCard.querySelector('.client-name').textContent = `${data.nombre} ${data.apellido || ''}`;
                clientCard.querySelector('.client-phone').innerHTML = `<i class="fas fa-phone"></i> ${data.telefono || 'No disponible'}`;
                clientCard.querySelector('.client-topics-text').textContent = data.temas_conversacion || 'Añade notas para conectar mejor.';
                if (data.foto_perfil_url) {
                    clientCard.querySelector('.client-photo img').src = `${data.foto_perfil_url}?t=${new Date().getTime()}`;
                }
                
                toggleEditMode(clientCard, false);
                clientCard.classList.remove('is-saving');
                if (saveBtn) saveBtn.disabled = false;
                
                setTimeout(() => { progressBar.style.width = '0%'; }, 400);

            }, 800);

        } catch (error) {
            console.error("Error guardando cliente:", error);
            alert(error.message || "Ocurrió un error inesperado al guardar.");
            clientCard.classList.remove('is-saving');
            if (saveBtn) saveBtn.disabled = false;
            progressBar.style.width = '0%';
        }
    }
    
    /**
     * Elimina un cliente y su foto de perfil del almacenamiento.
     */
    async function handleDeleteClient(clientId) {
        if (!confirm("¿Estás seguro de que quieres eliminar este cliente? Esta acción no se puede deshacer y borrará también su foto de perfil.")) {
            return;
        }

        try {
            const { data: client, error: fetchError } = await supabaseClient
                .from('clientes')
                .select('foto_perfil_url')
                .eq('id', clientId)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') { // Ignorar si el cliente no se encuentra
                throw new Error("No se pudo obtener la información del cliente para el borrado.");
            }

            if (client && client.foto_perfil_url) {
                const bucketName = 'client-photos';
                const urlParts = client.foto_perfil_url.split('/');
                const filePath = urlParts.slice(urlParts.indexOf(bucketName) + 1).join('/');

                if (filePath) {
                     await supabaseClient.storage.from(bucketName).remove([filePath]);
                }
            }

            const { error: deleteDbError } = await supabaseClient
                .from('clientes')
                .delete()
                .eq('id', clientId);

            if (deleteDbError) throw new Error("Error al eliminar el perfil del cliente de la base de datos.");

            const clientCard = document.getElementById(`client-card-${clientId}`);
            if (clientCard) {
                clientCard.style.transition = 'opacity 0.5s, transform 0.5s';
                clientCard.style.opacity = '0';
                clientCard.style.transform = 'scale(0.9)';
                setTimeout(() => clientCard.remove(), 500);
            }

        } catch (error) {
            console.error("Error en el proceso de eliminación del cliente:", error);
            alert(error.message || "Ocurrió un error al intentar eliminar el cliente.");
        }
    }

    // Iniciar el módulo
    initClientModule();
});
