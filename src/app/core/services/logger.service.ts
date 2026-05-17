import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  error(message: string, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }

  warn(message: string, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams);
  }

  info(message: string, ...optionalParams: any[]) {
    console.info(message, ...optionalParams);
  }

  log(message: string, ...optionalParams: any[]) {
    console.log(message, ...optionalParams);
  }
}
