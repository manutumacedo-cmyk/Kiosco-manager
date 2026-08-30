-- B50 · Diferencias entre cajas (el retiro de recaudación entre turnos)
--
-- El problema: el turno cierra contando fondo + recaudación (ej. $17.690). Después
-- alguien se lleva la recaudación y el turno siguiente abre declarando un fondo chico
-- ($480). Esos $17.210 no quedaban registrados en ningún lado. Medido sobre los 81
-- turnos de producción: $602.421 y R$ 7.842 que salieron del local sin dejar rastro.
--
-- POR QUÉ ES UNA VISTA Y NO UN MOVIMIENTO REGISTRADO:
--
-- La idea original (B40/B50) era grabar el retiro con register_cash_movement al abrir.
-- Eso ROMPE EL ARQUEO. `diferencia_uyu` es una columna GENERATED:
--
--   diferencia_uyu = efectivo_contado_uyu
--                  - (monto_inicial + total_efectivo_uyu + total_entradas_uyu
--                     - total_salidas_uyu)
--
-- Las salidas entran en el cálculo. Grabar el retiro como salida del turno que abre le
-- baja el esperado ~$17.000 y esa noche cerraría mostrando un "Sobró $17.000" falso.
-- Sería romper el cuadre justo con la herramienta que vino a protegerlo.
--
-- Derivarlo tiene además dos ventajas: cubre los 81 turnos que YA existen (persistir al
-- abrir solo captura de hoy en adelante), y no puede desincronizarse de su fuente.
--
-- La ventana es sobre `apertura_at`: el cajón es UNO SOLO y físico, así que el turno
-- anterior es el anterior real aunque lo haya cerrado otra persona.

create or replace view diferencias_entre_turnos as
with ordenados as (
  select
    id,
    estado,
    apertura_at,
    cierre_at,
    cajero,
    cerrado_por,
    monto_inicial,
    monto_inicial_brl,
    efectivo_contado_uyu,
    efectivo_contado_brl,
    lag(id)                              over w as turno_anterior_id,
    lag(cierre_at)                       over w as cierre_anterior_at,
    lag(coalesce(cerrado_por, cajero))   over w as cerro_anterior,
    lag(efectivo_contado_uyu)            over w as contado_anterior_uyu,
    lag(efectivo_contado_brl)            over w as contado_anterior_brl
  from cash_sessions
  window w as (order by apertura_at)
)
select
  id                     as turno_id,
  estado,
  apertura_at,
  cajero                 as abrio,
  turno_anterior_id,
  cierre_anterior_at,
  cerro_anterior,
  contado_anterior_uyu,
  contado_anterior_brl,
  monto_inicial          as fondo_uyu,
  monto_inicial_brl      as fondo_brl,

  -- Retiro = lo que se contó al cerrar menos lo que se declaró al abrir.
  -- Positivo: salió plata del local (lo normal, es la recaudación).
  -- Negativo: apareció plata que nadie registró — eso hay que mirarlo.
  -- NULL: el turno anterior no dejó conteo, no hay con qué comparar.
  (contado_anterior_uyu - monto_inicial)     as retiro_uyu,
  (contado_anterior_brl - monto_inicial_brl) as retiro_brl,

  -- Cuánto tiempo estuvo la plata en el local sin turno abierto. Un hueco largo
  -- entre el cierre y la apertura siguiente es donde se mueve el efectivo.
  (apertura_at - cierre_anterior_at)         as hueco
from ordenados
where turno_anterior_id is not null;

comment on view diferencias_entre_turnos is
  'B50 · Retiro de recaudación entre turnos: compara el efectivo contado al cerrar '
  'con el fondo declarado en la apertura siguiente. Derivada, no persistida: registrar '
  'el retiro como cash_outflow corrompería diferencia_uyu/brl, que son GENERATED sobre '
  'total_salidas_*. Solo la lee el admin (el corte es en el cliente, ver B49/B36).';
