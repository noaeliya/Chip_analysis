import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient() // שורה זו מאפשרת לאנגולר להפעיל את שירותי הרשת בהצלחה
  ]
};