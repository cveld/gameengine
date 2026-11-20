import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';

@Component({
  selector: 'app-marble-race',
  templateUrl: './marble-race.component.html',
  styleUrls: ['./marble-race.component.scss']
})
export class MarbleRaceComponent {
  readonly gameUrl: SafeResourceUrl;
  /** Set when the game asks to fill the screen where native fullscreen is unavailable (iPhone). */
  immersive = false;

  @ViewChild('gameFrame') private gameFrame?: ElementRef<HTMLIFrameElement>;

  constructor(sanitizer: DomSanitizer, private router: Router) {
    // Fixed, local asset URL; never pass user input through the sanitizer bypass.
    this.gameUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/marble-race/index.html');
  }

  @HostListener('window:message', ['$event'])
  onFrameMessage(event: MessageEvent): void {
    // Only the same-origin game frame may navigate; the target is fixed here.
    if (event.origin !== window.location.origin ||
        !this.gameFrame?.nativeElement.contentWindow ||
        event.source !== this.gameFrame.nativeElement.contentWindow) {
      return;
    }
    if (event.data?.type === 'marble:back') {
      void this.router.navigateByUrl('/');
    } else if (event.data?.type === 'marble:immersive') {
      this.immersive = event.data.on === true;
    }
  }
}
