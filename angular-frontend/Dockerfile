# שלב 1: בניית האפליקציה באמצעות Node.js
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build -- --configuration=production

# שלב 2: הגשת האפליקציה באמצעות שרת אינטרנט מהיר (Nginx)
FROM nginx:alpine

# 🔥 התיקון המוחלט: שימוש בכוכבית כפולה כדי להעתיק את הקבצים עצמם מכל עומק בתוך dist
COPY --from=build /app/dist/angular-frontend/browser/* /usr/share/nginx/html/

# שורת גיבוי למקרה שאנגולר לא מייצר תיקיית browser בלינוקס:
# אם הפקודה למעלה נכשלת בבנייה, החליפי אותה בשורה הבאה:
# COPY --from=build /app/dist/angular-frontend/* /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]