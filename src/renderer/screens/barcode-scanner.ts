// Heuristica pura de escaner USB-HID (sales-transactions/spec.md "Barcode
// Scanner Input (HID)", design.md "Escaner USB-HID", tasks.md 5.7). Separada
// del listener real de `document.addEventListener('keydown', ...)` en
// `Ventas.tsx` para poder probarla sin simular eventos de teclado reales --
// el listener solo acumula `{key, timestamp}` y le pasa el buffer completo a
// estas funciones al recibir Enter.

export interface BufferedKey {
  key: string
  timestamp: number
}

/** Gap maximo entre teclas para considerarse velocidad de escaner (design.md). */
export const MAX_SCAN_GAP_MS = 50

/**
 * Un escaneo real de escaner mantiene un gap consistente y rapido entre
 * TODAS las teclas del codigo. Un solo gap >= MAX_SCAN_GAP_MS ya indica
 * tecleo humano y el buffer se descarta (design.md). Requiere al menos 2
 * teclas para poder medir un gap -- una sola tecla no es un codigo de barras.
 */
export function isBarcodeScan(keys: BufferedKey[]): boolean {
  if (keys.length < 2) return false

  for (let i = 1; i < keys.length; i++) {
    if (keys[i].timestamp - keys[i - 1].timestamp >= MAX_SCAN_GAP_MS) {
      return false
    }
  }

  return true
}

export function bufferToBarcode(keys: BufferedKey[]): string {
  return keys.map((k) => k.key).join('')
}
