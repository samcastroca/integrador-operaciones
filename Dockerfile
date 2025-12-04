FROM node:22.9.0

# Instalar bash
RUN apt-get update && apt-get install -y bash

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar solo los archivos necesarios para instalar dependencias primero
COPY package*.json ./

# ✅ Actualizar npm a la última versión
RUN npm install -g npm@11.4.1

# Instalar dependencias del proyecto
RUN npm install

# Luego copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 4000

# Comando por defecto al iniciar el contenedor
CMD ["npm", "run", "manual"]
