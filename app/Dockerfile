FROM node:22-alpine

WORKDIR /app

# Copy package manifests first so dependency installation can be cached across builds
COPY package*.json ./

# Copy Prisma schema files so prisma generate can execute during dependency installation
COPY prisma ./prisma

# Copy the full application source code into the image
COPY src ./src

# Install production dependencies and trigger prisma client generation via postinstall
RUN npm ci --only=production

# Copy the startup script responsible for running migrations and launching the app
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Define the port where the application will listen for incoming requests (Cloud Run expects the app to listen on 8080)
ENV PORT=8080
EXPOSE 8080

# Run the entrypoint script to apply database migrations and start the server
CMD ["./entrypoint.sh"]
