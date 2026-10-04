import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-flappy-muis',
  templateUrl: './flappy-muis.component.html',
  styleUrls: ['./flappy-muis.component.scss']
})
export class FlappyMuisComponent {
  gameUrl: SafeResourceUrl;

  constructor(sanitizer: DomSanitizer) {
    this.gameUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/flappy-muis/index.html');
  }
}
