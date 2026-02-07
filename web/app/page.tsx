export default function Home() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Kiosco Manager</h1>
      <ul>
        <li><a href="/productos">Productos</a></li>
        <li><a href="/ventas/nueva">Nueva venta</a></li>
        <li><a href="/reportes/hoy">Reporte hoy</a></li>
      </ul>
    </div>
  );
}
