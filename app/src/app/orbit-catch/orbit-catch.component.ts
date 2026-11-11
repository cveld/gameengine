import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-orbit-catch',
  templateUrl: './orbit-catch.component.html',
  styleUrls: ['./orbit-catch.component.scss']
})
export class OrbitCatchComponent {
  readonly gameUrl: SafeResourceUrl;

  constructor(sanitizer: DomSanitizer) {
    this.gameUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/orbit-catch/index.html');
  }
}
