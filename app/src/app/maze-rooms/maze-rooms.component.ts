import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-maze-rooms',
  templateUrl: './maze-rooms.component.html',
  styleUrls: ['./maze-rooms.component.scss']
})
export class MazeRoomsComponent {
  mazeUrl: SafeResourceUrl;

  constructor(sanitizer: DomSanitizer) {
    this.mazeUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/maze-rooms/index.html');
  }
}
