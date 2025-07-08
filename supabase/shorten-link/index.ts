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
  // Manejar la solicitud pre-vuelo (CORS) para que el navegador permita la llamada
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
    // Extraer datos del cuerpo de la solicitud
    const { longUrl, barberName } = await req.json();
    if (!longUrl || !barberName) {
      throw new Error("Faltan 'longUrl' o 'barberName' en la solicitud.");
    }

    // Obtener el token de Bitly de los secretos de Supabase
    const bitlyToken = Deno.env.get("BITLY_TOKEN");
    if (!bitlyToken) {
      throw new Error("El secreto BITLY_TOKEN no está configurado en Supabase.");
    }

    // Preparar el enlace personalizado (ej: 'corte-con-juan-perez')
    const customKeyword = `corte-con-${slugify(barberName)}`;
    const bitlyApiUrl = 'https://api-ssl.bitly.com/v4/shorten';

    // Llamar a la API de Bitly con el nombre personalizado
    const bitlyResponse = await fetch(bitlyApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bitlyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        long_url: longUrl,
        domain: "bit.ly",
        custom_bitlink: customKeyword
      }),
    });
    
    const bitlyData = await bitlyResponse.json();

    // Si el nombre personalizado ya existe, Bitly da un error.
    // Lo capturamos e intentamos de nuevo sin el nombre personalizado.
    if (!bitlyResponse.ok && bitlyData.message?.includes('ALREADY_EXISTS')) {
      console.warn(`El bitlink personalizado "${customKeyword}" ya existe. Creando uno genérico.`);
      
      const genericResponse = await fetch(bitlyApiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${bitlyToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ long_url: longUrl, domain: "bit.ly" }),
      });
      
      const genericData = await genericResponse.json();
      if (!genericResponse.ok) throw new Error(genericData.message || 'Error secundario de Bitly.');
      
      return new Response(JSON.stringify({ shortUrl: genericData.link }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 200,
      });
    }
    
    if (!bitlyResponse.ok) {
        throw new Error(bitlyData.message || 'Error desconocido de la API de Bitly.');
    }

    // Devolver el enlace corto exitoso
    return new Response(JSON.stringify({ shortUrl: bitlyData.link }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 200,
    });

  } catch (error) {
    // Manejo de errores generales
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400,
    });
  }
});
