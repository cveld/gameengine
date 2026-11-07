import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-orbit',
  templateUrl: './orbit.component.html',
  styleUrls: ['./orbit.component.scss']
})
export class OrbitComponent {
  readonly orbitUrl: SafeResourceUrl;
  frameHeight = 800;

  @ViewChild('orbitFrame') private orbitFrame?: ElementRef<HTMLIFrameElement>;

  constructor(sanitizer: DomSanitizer) {
    this.orbitUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/orbit/index.html');
  }

  @HostListener('window:message', ['$event'])
  onFrameMessage(event: MessageEvent): void {
    // Only the same-origin Orbit frame may resize this page.
    if (event.origin !== window.location.origin ||
        !this.orbitFrame?.nativeElement.contentWindow ||
        event.source !== this.orbitFrame.nativeElement.contentWindow ||
        event.data?.type !== 'orbit:resize') {
      return;
    }
    const height = event.data.height;
    if (typeof height === 'number' && Number.isFinite(height) && height >= 200 && height <= 5000) {
      this.frameHeight = Math.ceil(height);
    }
  }
}
