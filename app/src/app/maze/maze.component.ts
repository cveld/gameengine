import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-maze',
  templateUrl: './maze.component.html',
  styleUrls: ['./maze.component.scss']
})
export class MazeComponent {
  mazeUrl: SafeResourceUrl;

  constructor(sanitizer: DomSanitizer) {
    this.mazeUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/maze/index.html');
  }
}
