FROM node:20-alpine AS frontend-build
WORKDIR /frontend

COPY angular-frontend/package*.json ./
RUN npm install

COPY angular-frontend/ .
RUN npm run build -- --configuration=production

FROM python:3.11-slim
WORKDIR /app

RUN pip install --no-cache-dir flask flask-cors

COPY backend/ .

COPY --from=frontend-build /frontend/dist/angular-frontend/browser/ /app/static/

EXPOSE 5000

CMD ["python", "app.py"]