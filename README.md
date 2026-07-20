# Control Energético - Plataforma de Cálculo de Consumo Eléctrico

Sistema integral para el cálculo, monitoreo y gestión del consumo eléctrico de maquinarias en instalaciones industriales y comerciales.

**Desarrollado para:** Grupo Limpiolux (Limpiolux S.A. y Ceiling Solution S.A.)

---

## 📋 TABLA DE CONTENIDOS

1. [¿Qué es esta aplicación?](#qué-es-esta-aplicación)
2. [Características principales](#características-principales)
3. [Cómo calcula el consumo](#cómo-calcula-el-consumo)
4. [Instalación](#instalación)
5. [Uso de la aplicación](#uso-de-la-aplicación)
6. [Estructura técnica](#estructura-técnica)
7. [Credenciales por defecto](#credenciales-por-defecto)

---

## ¿Qué es esta aplicación?

**Control Energético** es una plataforma web que permite:

- 📊 **Calcular consumo eléctrico** de máquinas por servicio/cliente
- 📈 **Monitorear tendencias** de consumo mensual
- 🔍 **Analizar datos** con dashboards interactivos
- 👥 **Gestionar usuarios** y permisos de acceso
- 📂 **Importar datos** desde planillas Excel
- ⚙️ **Configurar servicios** que incluir/excluir en cálculos

### Unidades de negocio soportadas
- **Limpiolux S.A.** - Servicios de limpieza industrial
- **Ceiling Solution S.A.** - Soluciones de suspensión

---

## Características principales

### 1️⃣ **Panel General (Dashboard)**
- **KPIs en tiempo real:**
  - Máquinas activas
  - Servicios operativos
  - Potencia instalada (kW)
  - Consumo diario (kWh/día)
  - Consumo mensual estimado (kWh/mes)

- **Gráficos analíticos:**
  - Histórico de consumo por unidad de negocio
  - Top 8 máquinas con mayor consumo
  - Top 8 servicios/clientes con mayor consumo

### 2️⃣ **Cálculos Detallados**
Tabla interactiva con:
- Detalles de cada máquina por servicio
- Potencia, horas de uso, consumo calculado
- Edición en línea de parámetros
- Búsqueda y filtrado
- Exportación a CSV y Excel
- Paginación de resultados

### 3️⃣ **Carga de Horas**
Interface para supervisores:
- Carga rápida de horas de uso por servicio
- Validación de datos
- Guardado en lote
- Bloqueo automático al cerrar período

### 4️⃣ **Configuración**
Panel de control para elegir qué servicios incluir:
- Lista completa de servicios con checkboxes
- Búsqueda para encontrar servicios
- Seleccionar/desseleccionar todos
- Persistencia de configuración en localStorage

### 5️⃣ **Importar Planilla**
Importación de datos Excel:
- Mapeo automático de columnas
- Validación de datos
- Cálculo automático al importar
- Historial de importaciones

### 6️⃣ **Gestión de Usuarios** (Admin)
- Crear usuarios
- Asignar servicios por usuario
- Cambiar contraseñas
- Activar/desactivar cuentas
- Gestión de roles (Admin/Supervisor)

### 7️⃣ **Cierre de Período**
- Bloqueo de datos después de auditoría
- Foto de comprobante obligatoria
- Historial de cierres
- Protección contra modificaciones

---

## Cómo calcula el consumo

### 📐 Fórmula de cálculo

```
CONSUMO MENSUAL (kWh) = (Potencia en W × Horas/día × Días del mes) / 1000
```

### Desglose detallado

**1. Base de datos:**
- **Potencia (W):** Potencia nominal de la máquina en Watts
- **Hs/Día:** Horas de funcionamiento diario de la máquina
- **Mes:** Período a calcular (YYYY-MM)
- **Días/Mes:** Variable según el mes (28-31 días)

**2. Cálculo intermedio (guardado en BD):**
```
calculo_diario (Wh/día) = Potencia (W) × Hs/Día (h)
```
Ejemplo:
- Máquina: 500W
- Horas/día: 8h
- Resultado: 500 × 8 = 4,000 Wh/día

**3. Cálculo final (mostrado en dashboards):**
```
Consumo Mensual (kWh) = (calculo_diario × Días del mes) / 1000
```
Ejemplo:
- Consumo diario: 4,000 Wh/día
- Días en mes: 30
- Resultado: (4,000 × 30) / 1000 = 120 kWh/mes

### Unidades utilizadas

| Variable | Unidad | Descripción |
|----------|--------|-------------|
| Potencia | W (Watts) | Potencia nominal de la máquina |
| Horas | h (horas) | Horas de funcionamiento |
| Consumo (BD) | Wh (Watt-hora) | Consumo diario almacenado |
| Consumo (Dashboard) | kWh | Consumo mensual mostrado |

### Casos de uso del cálculo

**Ejemplo 1: Máquina de limpieza industrial**
- Potencia: 2,200W (2.2kW)
- Horas/día: 6 horas
- Días del mes: 30
- Consumo: (2,200 × 6 × 30) / 1000 = **396 kWh/mes**

**Ejemplo 2: Máquina de aire acondicionado**
- Potencia: 1,500W (1.5kW)
- Horas/día: 10 horas
- Días del mes: 30
- Consumo: (1,500 × 10 × 30) / 1000 = **450 kWh/mes**

---

## Instalación

### Requisitos previos
- **Node.js** v14 o superior
- **npm** (incluido con Node.js)
- **SQLite3** (incluido en las dependencias)

### Pasos de instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/elixseo/Calculo-de-consumo-electrico-.git
cd "Nuevo Calculo de Consumo electrico"
```

2. **Instalar dependencias**
```bash
cd Calculo
npm install
```

3. **Iniciar el servidor**
```bash
npm start
```
O directamente:
```bash
node server.js
```

4. **Acceder a la aplicación**
```
http://localhost:3005
```

### Estructura de directorios
```
Nuevo Calculo de Consumo electrico/
├── Calculo/
│   ├── public/
│   │   ├── index.html          # Interfaz principal
│   │   ├── css/
│   │   │   └── style.css       # Estilos
│   │   └── js/
│   │       └── app.js          # Lógica del frontend
│   ├── server.js               # Servidor Node.js
│   ├── database.js             # Manejo de BD
│   ├── consumo.db              # Base de datos SQLite
│   └── package.json            # Dependencias
├── Datoscalculoconsumo/        # Archivos Excel de datos
├── inventarios2026/            # Datos de inventarios
└── README.md                   # Este archivo
```

---

## Uso de la aplicación

### 1. Iniciar sesión

**Credenciales por defecto:**

| Rol | Usuario | Contraseña |
|-----|---------|-----------|
| Administrador | `admin` | `admin` |
| Supervisor | `supervisor1` | `1234` |

⚠️ **Importante:** Cambiar contraseñas en producción

### 2. Panel General

**Acceso:** Menú → Panel General (o al iniciar sesión)

**Qué ver:**
- **KPIs:** Resumen en tiempo real de máquinas, servicios y consumo
- **Gráfico de tendencia:** Consumo histórico por unidad
- **Gráfico de máquinas:** Top 8 máquinas por consumo
- **Gráfico de servicios:** Top 8 servicios/clientes por consumo

**Filtros disponibles:**
- 📅 **Período:** Seleccionar mes y año
- 🏢 **Unidad:** Limpiolux S.A. o Ceiling Solution S.A.
- 🏪 **Servicio:** Cliente/ubicación específica
- ⚙️ **Máquina:** Máquina específica

### 3. Cálculos Detallados

**Acceso:** Menú → Cálculos Detallados

**Funciones:**
- Ver tabla de todas las máquinas con consumos
- **Buscar:** Por servicio, máquina, marca, modelo, N° de casa
- **Editar:** Hacer clic en ✏️ para cambiar potencia o horas
- **Exportar:** CSV o Excel para análisis externo
- **Paginar:** Ver 50 registros por página

### 4. Carga de Horas

**Acceso:** Menú → Carga de Horas

**Cómo usar:**
1. Seleccionar periodo (mes) del dropdown
2. Seleccionar servicio
3. Ingresar horas/día para cada máquina
4. Hacer clic en "Guardar"
5. Al finalizar mes, hacer clic en "Cerrar período" con foto de auditoría

### 5. Configuración

**Acceso:** Menú → Configuración

**Cómo excluir servicios:**
1. Ver lista de todos los servicios
2. Buscar el servicio a excluir (ej: "C.I.M")
3. **Desmarcar el checkbox** al lado del servicio
4. Hacer clic en "Guardar Configuración"
5. El dashboard y tablas se actualizarán automáticamente

**Beneficio:** Los servicios excluidos no aparecen en cálculos pero siguen en la BD

### 6. Importar Planilla Excel

**Acceso:** Menú → Importar Planilla (Admin only)

**Formato esperado en Excel:**
| Nro Máquina | Máquina | Marca | Modelo | Potencia (W) | Hs/Día | Nro Casa | Nombre Servicio |
|-----------|---------|-------|--------|----------|--------|---------|-----------------|
| 1001 | Bomba | Grundfos | 1.5kW | 1500 | 8 | 212005000 | A.T.I.L.R.A. - EDIF. SAN MARTIN |

**Pasos:**
1. Seleccionar año y mes
2. Arrastrar o seleccionar archivo Excel
3. Hacer clic en "Importar y Calcular"
4. Sistema valida, mapea columnas y calcula automáticamente

### 7. Gestión de Usuarios (Admin only)

**Acceso:** Menú → Gestión de Usuarios

**Crear usuario:**
1. Llenar formulario (Nombre, Usuario, Contraseña, Rol)
2. Hacer clic en "Crear Usuario"

**Asignar servicios a usuario:**
1. Hacer clic en el ícono de servicios del usuario
2. Seleccionar servicios que puede acceder
3. Guardar asignación

---

## Estructura técnica

### Backend (Node.js + Express)

**Rutas principales:**

| Método | Ruta | Descripción |
|--------|------|------------|
| POST | `/api/auth/login` | Autenticación |
| GET | `/api/dashboard` | Datos de dashboard |
| GET | `/api/consumo` | Tabla de cálculos |
| PUT | `/api/consumo/:id` | Editar cálculo |
| POST | `/api/horas` | Guardar horas en lote |
| GET | `/api/servicios` | Lista de servicios |
| POST | `/api/import` | Importar Excel |
| POST | `/api/cierres` | Cerrar período |
| GET | `/api/usuarios` | Gestión de usuarios |

### Base de datos (SQLite)

**Tablas principales:**

1. **maquinas_potencia**
   - nro_maquina (PK)
   - maquina, marca, modelo
   - potencia (W)

2. **servicios_casas**
   - nro_casa (PK)
   - nombre_servicio

3. **inventario_mensual**
   - id (PK)
   - mes, nro_maquina, nro_casa
   - hs_dia, calculo (Wh/día)
   - unidad_negocio

4. **usuarios**
   - id (PK)
   - username, password, salt
   - role, nombre, activo

5. **usuario_servicios**
   - usuario_id, nro_casa
   - (Relación de servicios por usuario)

6. **cierres_mensuales**
   - mes, nro_casa
   - usuario_id, fecha_cierre
   - foto_auditoria

### Frontend (HTML/CSS/JavaScript)

**Librerías:**
- Chart.js - Gráficos interactivos
- FontAwesome - Iconos
- Google Fonts - Tipografía

**Características:**
- Interfaz responsiva
- Tema oscuro/claro
- Filtros en tiempo real
- Búsqueda con debounce
- Validación de formularios
- Exportación de datos

---

## Credenciales por defecto

Al iniciar la aplicación por primera vez, se crean automáticamente:

```
Usuario: admin
Contraseña: admin
Rol: Administrador

Usuario: supervisor1
Contraseña: 1234
Rol: Supervisor
```

⚠️ **SEGURIDAD:** Cambiar estas contraseñas inmediatamente en producción

---

## Versión

- **Versión:** 1.0.0
- **Última actualización:** Julio 2026
- **Estado:** Producción

---

## Soporte

Para reportar problemas o solicitar mejoras:
1. Revisar la documentación completa
2. Verificar credenciales y permisos
3. Consultar con el equipo de desarrollo

---

## Licencia

© 2026 Grupo Limpiolux. Todos los derechos reservados.

---

## Notas de desarrollo

### Correcciones recientes (v1.0.0)

- ✅ Corregido cálculo de consumo eléctrico
- ✅ Agregado filtro por máquinas
- ✅ Agregado panel de configuración para excluir servicios
- ✅ Optimización de consultas SQL
- ✅ Mejorada interfaz de usuario

### Roadmap futuro

- 🔄 Exportación a reportes PDF
- 📊 Análisis comparativo mes a mes
- 💾 Backup automático de datos
- 📱 Aplicación móvil nativa
- 🤖 Predicción de consumo con IA
