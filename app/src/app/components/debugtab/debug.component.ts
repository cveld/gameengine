import { Component, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SignalrService } from '../../services/signalr/SignalrService';
import { ISignalrMessage, UserTypeEnum } from '../../shared/signalrmodels';

interface ICallResult {
  success: boolean;
  status?: number;
  statusText?: string;
  body?: string;
}

const RECEIVE_TIMEOUT_MS = 8000;

@Component({
  selector: 'app-debug',
  templateUrl: './debug.component.html',
  styleUrls: ['./debug.component.scss']
})
export class DebugComponent implements OnDestroy {

  constructor(public signalr: SignalrService) { }

  negotiateResult?: ICallResult;
  messageResult?: ICallResult;
  receiveResult?: ICallResult;

  private pendingReceive?: { type: string; handler: (message: ISignalrMessage<any>) => void; timer: any };

  ngOnDestroy(): void {
    this.cancelPendingReceive();
  }

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
    const stamp = Date.now();
    this.signalr.sendSignalrMessage({
      type: 'debug.ping',
      usertype: UserTypeEnum.undefined,
      payload: { stamp }
    }).subscribe({
      next: () => this.messageResult = { success: true, body: `message sent (${stamp})` },
      error: (error: HttpErrorResponse) => this.messageResult = this.toCallResult(error)
    });
  }

  testReceiveMessage() {
    this.cancelPendingReceive();
    this.receiveResult = undefined;

    const type = 'debug.echo';
    const stamp = Date.now();
    let settled = false;

    const finish = (result: ICallResult) => {
      if (settled) return;
      settled = true;
      this.signalr.removeHandler(type, handler);
      clearTimeout(timer);
      this.pendingReceive = undefined;
      this.receiveResult = result;
    };

    const handler = (message: ISignalrMessage<{ stamp: number }>) => {
      if (message?.payload?.stamp === stamp) {
        finish({ success: true, body: `message received (${stamp})` });
      }
    };

    const timer = setTimeout(() => {
      finish({ success: false, body: `timeout: no broadcast received for (${stamp}) within ${RECEIVE_TIMEOUT_MS}ms` });
    }, RECEIVE_TIMEOUT_MS);

    this.pendingReceive = { type, handler, timer };
    this.signalr.addHandler(type, handler);

    this.signalr.sendSignalrMessage({
      type,
      usertype: UserTypeEnum.undefined,
      payload: { stamp }
    }).subscribe({
      error: (error: HttpErrorResponse) => finish(this.toCallResult(error))
    });
  }

  private cancelPendingReceive() {
    if (!this.pendingReceive) return;
    const { type, handler, timer } = this.pendingReceive;
    clearTimeout(timer);
    this.signalr.removeHandler(type, handler);
    this.pendingReceive = undefined;
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
