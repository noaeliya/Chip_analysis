# שלב 1: בניית האפליקציה באמצעות Node.js
FROM node:20-alpine AS build

WORKDIR /app

# העתקת קבצי הגדרות התלויות והתקנתן
COPY package*.json ./
RUN npm install

# העתקת קוד המקור ובניית הפרויקט ל-Production
COPY . .
RUN npm run build -- --configuration=production

# שלב 2: הגשת האפליקציה באמצעות שרת אינטרנט מהיר (Nginx)
FROM nginx:alpine

# העתקת קבצי הציור המוכנים של אנגולר לתיקיית ההגשה של Nginx
# שימי לב: ודאי ששם התיקייה ב-dist מתאים לשם הפרויקט שלך (למשל dist/my-telemetry-app/browser)
COPY --from=build /app/dist/*/browser /usr/share/nginx/html

# חשיפת הפורט של אנגולר (80)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]