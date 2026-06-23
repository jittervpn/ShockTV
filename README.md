# 🎬 ShockTV

Plataforma de películas y series usando la API de TMDB.

## 🚀 Deploy en Railway

### 1. Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit - ShockTV"
git remote add origin https://github.com/TU_USUARIO/shocktv.git
git push -u origin main
```

### 2. Configurar en Railway
1. Ve a [railway.app](https://railway.app) y conecta tu repo de GitHub
2. En el panel de tu proyecto, ve a **Variables**
3. Agrega estas variables de entorno:

| Variable | Valor |
|---|---|
| `TMDB_API_KEY` | Tu API Key de TMDB |
| `TMDB_TOKEN` | Tu Bearer Token de TMDB |
| `PORT` | `3000` (Railway lo asigna automáticamente) |

> ⚠️ **NUNCA** pongas tus claves directamente en el código ni las subas a GitHub.

### 3. Deploy
Railway detectará automáticamente el `package.json` y hará el deploy.

## 🔧 Desarrollo local

1. Copia el archivo de ejemplo:
```bash
cp .env.example .env
```

2. Edita `.env` con tus credenciales reales.

3. Instala dependencias:
```bash
npm install
```

4. Inicia el servidor:
```bash
npm start
# o en modo dev:
npm run dev
```

5. Abre http://localhost:3000

## 📁 Estructura

```
ShockTV/
├── server.js          # Backend Express (proxy seguro a TMDB)
├── package.json
├── railway.json       # Config de Railway
├── .env.example       # Plantilla de variables (sin valores reales)
├── .gitignore         # Excluye .env y node_modules
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## 🔒 Seguridad

- Las API keys viven **solo en el servidor** como variables de entorno
- El frontend **nunca** tiene acceso a las credenciales
- `.env` está en `.gitignore` para no subirlo a GitHub
