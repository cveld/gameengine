import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';

@Component({
  selector: 'app-orbit-catch',
  templateUrl: './orbit-catch.component.html',
  styleUrls: ['./orbit-catch.component.scss']
})
export class OrbitCatchComponent {
  readonly gameUrl: SafeResourceUrl;

  @ViewChild('gameFrame') private gameFrame?: ElementRef<HTMLIFrameElement>;

  constructor(sanitizer: DomSanitizer, private router: Router) {
    this.gameUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/orbit-catch/index.html');
  }

  @HostListener('window:message', ['$event'])
  onFrameMessage(event: MessageEvent): void {
    // Only the same-origin game frame may navigate; the target is fixed here.
    if (event.origin !== window.location.origin ||
        !this.gameFrame?.nativeElement.contentWindow ||
        event.source !== this.gameFrame.nativeElement.contentWindow) {
      return;
    }
    if (event.data?.type === 'orbit:back') {
      void this.router.navigateByUrl('/orbit');
    }
  }
}
