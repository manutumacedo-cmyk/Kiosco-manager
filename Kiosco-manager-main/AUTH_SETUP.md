# 24 SIETE - Guía de Configuración de Autenticación

## 🔒 Sistema de Login Implementado

Se ha implementado un sistema de autenticación robusto con las siguientes características:

- ✅ Middleware que protege TODAS las rutas automáticamente
- ✅ Login con credenciales desde variables de entorno (.env)
- ✅ JWT (JSON Web Tokens) firmados para seguridad
- ✅ Cookies HTTP-only (no accesibles desde JavaScript del cliente)
- ✅ Sesión persistente (7 días)
- ✅ Diseño Cyberpunk consistente con el resto de la app
- ✅ Botón de Logout en la barra de navegación

---

## 📦 Paso 1: Instalar Dependencias

Necesitás instalar el paquete `jose` para manejar JWT:

```bash
npm install jose
```

---

## 🔧 Paso 2: Configurar Variables de Entorno

1. Copiá el archivo `.env.example` y renombralo a `.env.local`:

```bash
cp .env.example .env.local
```

2. Editá `.env.local` y configurá tus credenciales:

```env
# Credenciales de acceso
AUTH_USERNAME=admin
AUTH_PASSWORD=tu_password_super_segura_aqui

# Secret para firmar tokens (IMPORTANTE: usá un string largo y aleatorio)
AUTH_SECRET=genera_un_string_aleatorio_largo_y_seguro_de_al_menos_32_caracteres
```

### Cómo generar AUTH_SECRET:

Opción 1 - Desde la terminal (Linux/Mac/Git Bash):
```bash
openssl rand -base64 32
```

Opción 2 - Desde Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Opción 3 - Online:
Visitá https://generate-secret.vercel.app/32 (generador de secrets)

---

## 🚀 Paso 3: Reiniciar el Servidor

Después de configurar el .env.local, reiniciá el servidor de desarrollo:

```bash
# Detener el servidor actual (Ctrl+C)
# Luego iniciar de nuevo:
npm run dev
```

---

## 🎨 Archivos Creados

### Backend (Autenticación)
- `lib/services/authService.ts` - Lógica de autenticación (login, logout, JWT)
- `app/api/auth/login/route.ts` - API endpoint para login
- `app/api/auth/logout/route.ts` - API endpoint para logout
- `middleware.ts` - Protege todas las rutas automáticamente

### Frontend (UI)
- `app/login/page.tsx` - Pantalla de login con diseño cyberpunk
- `components/CyberNav.tsx` - Actualizado con botón de logout

### Configuración
- `.env.example` - Plantilla de variables de entorno
- `AUTH_SETUP.md` - Esta guía

---

## 🔐 Cómo Funciona

### Flujo de Autenticación:

1. **Usuario ingresa a cualquier ruta** (ej: `localhost:3000`)
2. **Middleware verifica** si existe un token válido en las cookies
3. **Si NO hay token válido** → Redirige a `/login`
4. **Usuario ingresa credenciales** en la pantalla de login
5. **Backend valida** contra las variables de entorno (.env.local)
6. **Si es correcto** → Crea un JWT firmado y lo guarda en una cookie HTTP-only
7. **Redirecciona** a la página principal (`/`)
8. **Usuario navega libremente** mientras el token sea válido (7 días)

### Seguridad:

- ✅ **Cookies HTTP-only**: JavaScript del navegador NO puede acceder al token
- ✅ **JWT firmado**: No se puede falsificar sin el AUTH_SECRET
- ✅ **Middleware automático**: Protege TODAS las rutas sin necesidad de código extra
- ✅ **SameSite Lax**: Protección contra CSRF
- ✅ **Secure en producción**: Cookies encriptadas en HTTPS

---

## 🧪 Probar el Sistema

1. Asegurate de que el servidor esté corriendo (`npm run dev`)
2. Abrí `http://localhost:3000`
3. Deberías ver la pantalla de login cyberpunk
4. Ingresá las credenciales que configuraste en `.env.local`
5. Si son correctas, te redirigirá a la página principal
6. Navegá por la app normalmente
7. Hacé click en "Salir" (botón rojo con 🔒) para cerrar sesión

---

## 🎨 Diseño de la Pantalla de Login

La pantalla de login sigue el diseño cyberpunk de "24 SIETE":

- Fondo negro profundo (`#0a0a0a`)
- Logo con círculos pulsantes (cyan y magenta)
- Inputs con estilo `.cyber-input`
- Botón "ENTRAR" con glow magenta intenso
- Mensaje de error con animación de pulso rojo si la contraseña es incorrecta
- Responsive design (funciona en móvil, tablet y desktop)

---

## 📝 Notas Importantes

### ⚠️ NUNCA subas el archivo `.env.local` a Git
El archivo `.env.local` contiene credenciales sensibles. Asegurate de que esté en `.gitignore`:

```bash
# Verificar que .env.local esté en .gitignore
cat .gitignore | grep .env.local
```

Si no está, agregalo:
```bash
echo ".env.local" >> .gitignore
```

### 🔄 Cambiar Credenciales

Si necesitás cambiar el usuario o contraseña:

1. Editá `.env.local`
2. Reiniciá el servidor (`npm run dev`)
3. Las nuevas credenciales estarán activas inmediatamente

### 🕒 Expiración de Sesión

El token expira después de 7 días. Podés modificar esto editando `TOKEN_MAX_AGE` en `lib/services/authService.ts`:

```typescript
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 días (en segundos)
```

Ejemplos:
- 1 hora: `60 * 60`
- 1 día: `60 * 60 * 24`
- 30 días: `60 * 60 * 24 * 30`

---

## 🐛 Solución de Problemas

### Error: "AUTH_SECRET no está configurado"
- Verificá que `.env.local` exista y contenga `AUTH_SECRET`
- Reiniciá el servidor después de crear/editar `.env.local`

### Error: "jose not found" o módulo no encontrado
- Instalá el paquete: `npm install jose`
- Reiniciá el servidor

### La página se queda cargando infinitamente
- Abrí las DevTools del navegador (F12) → Console
- Buscá errores de red o JavaScript
- Verificá que el servidor esté corriendo en el puerto correcto

### "Credenciales incorrectas" pero estoy seguro que son correctas
- Verificá que no haya espacios extra en `.env.local`
- Las credenciales son **case-sensitive** (distinguen mayúsculas/minúsculas)
- Reiniciá el servidor después de editar `.env.local`

### El botón "Salir" no funciona
- Abrí DevTools → Network → Intentá hacer logout
- Verificá que la petición a `/api/auth/logout` se complete
- Si hay error 500, revisá los logs del servidor

---

## 🚀 Deploy en Producción

Cuando vayas a deployar en Vercel/Netlify/etc:

1. **Configurá las variables de entorno** en el panel de tu servicio:
   - `AUTH_USERNAME`
   - `AUTH_PASSWORD`
   - `AUTH_SECRET`

2. **NO incluyas `.env.local`** en el deploy (Git debe ignorarlo)

3. **Cookies Secure**: En producción, las cookies se marcarán automáticamente como `Secure` (solo HTTPS)

---

## 📚 Próximos Pasos (Opcional)

Si querés extender el sistema de autenticación:

- **Múltiples usuarios**: Podés crear una tabla en Supabase con usuarios y hashear contraseñas con bcrypt
- **Roles y permisos**: Agregar campos de rol al JWT y verificar permisos en rutas específicas
- **Remember me**: Extender el `maxAge` del token si el usuario marca "Recordarme"
- **Recuperar contraseña**: Implementar envío de emails con tokens temporales

---

**Creado:** 2026-02-15
**Versión:** 1.0
**Autor:** Claude Sonnet 4.5 para proyecto 24 SIETE
