// supabase/functions/shorten-link/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Función para limpiar y formatear el nombre del barbero para una URL
const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Reemplaza espacios con -
    .replace(/[^\w\-]+/g, '') // Elimina caracteres no alfanuméricos (excepto -)
    .replace(/\-\-+/g, '-');  // Reemplaza múltiples - con uno solo
};

serve(async (req) => {
  // Manejar la solicitud pre-vuelo (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { longUrl, barberName } = await req.json();
    if (!longUrl || !barberName) {
      throw new Error("Faltan 'longUrl' o 'barberName' en la solicitud.");
    }

    // --- INICIO DE LA MODIFICACIÓN ---

    // 1. Extraer el user_id de la URL larga para garantizar unicidad.
    const urlParams = new URL(longUrl).searchParams;
    const barberId = urlParams.get('barber_id');
    if (!barberId) {
      throw new Error("No se encontró 'barber_id' en la longUrl.");
    }

    // 2. Tomar una parte del ID para añadirla al enlace (ej: los últimos 6 caracteres).
    const uniqueSuffix = barberId.slice(-6);

    // 3. Crear el nuevo keyword personalizado y único.
    const customKeyword = `corte-con-${slugify(barberName)}-${uniqueSuffix}`;

    // --- FIN DE LA MODIFICACIÓN ---

    const bitlyToken = Deno.env.get("BITLY_TOKEN");
    if (!bitlyToken) {
      throw new Error("El secreto BITLY_TOKEN no está configurado en Supabase.");
    }

    const bitlyApiUrl = 'https://api-ssl.bitly.com/v4/shorten';

    // Llamar a la API de Bitly con el keyword único.
    // Ya no necesitamos la lógica de respaldo porque este método no debería fallar.
    const bitlyResponse = await fetch(bitlyApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bitlyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        long_url: longUrl,
        domain: "bit.ly",
        custom_bitlink: customKeyword // Usamos el nuevo keyword único
      }),
    });
    
    const bitlyData = await bitlyResponse.json();

    if (!bitlyResponse.ok) {
        // Si por alguna razón falla, devolvemos el error de Bitly.
        throw new Error(bitlyData.message || 'Error desconocido de la API de Bitly.');
    }

    // Devolver el enlace corto exitoso
    return new Response(JSON.stringify({ shortUrl: bitlyData.link }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 200,
    });

  } catch (error) {
    // Manejo de errores generales
    console.error("Error en la Edge Function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }
});
