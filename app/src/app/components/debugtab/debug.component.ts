import { Component } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SignalrService } from '../../services/signalr/SignalrService';
import { UserTypeEnum } from '../../shared/signalrmodels';

interface ICallResult {
  success: boolean;
  status?: number;
  statusText?: string;
  body?: string;
}

@Component({
  selector: 'app-debug',
  templateUrl: './debug.component.html',
  styleUrls: ['./debug.component.scss']
})
export class DebugComponent {

  constructor(public signalr: SignalrService) { }

  negotiateResult?: ICallResult;
  messageResult?: ICallResult;

  reconnect() {
    this.signalr.start();
  }

  testNegotiate() {
    this.negotiateResult = undefined;
    this.signalr.testNegotiate().subscribe({
      next: response => this.negotiateResult = {
        success: true,
        status: response.status,
        statusText: response.statusText,
        body: JSON.stringify(response.body)
      },
      error: (error: HttpErrorResponse) => this.negotiateResult = this.toCallResult(error)
    });
  }

  testSendMessage() {
    this.messageResult = undefined;
    this.signalr.sendSignalrMessage({
      type: 'debug.ping',
      usertype: UserTypeEnum.undefined
    }).subscribe({
      next: response => this.messageResult = { success: true, body: JSON.stringify(response) },
      error: (error: HttpErrorResponse) => this.messageResult = this.toCallResult(error)
    });
  }

  private toCallResult(error: HttpErrorResponse): ICallResult {
    return {
      success: false,
      status: error.status,
      statusText: error.statusText,
      body: typeof error.error === 'string' ? error.error : JSON.stringify(error.error) ?? error.message
    };
  }
}
