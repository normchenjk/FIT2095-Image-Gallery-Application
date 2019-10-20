import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'image-gallery';

  selectedFile: File;
  newWidth: number;
  newHeight: number;

  thumbnail: string | ArrayBuffer;

  constructor(private http: HttpClient) { }

  onSelectFile(files: FileList) {
    this.selectedFile = files.item(0);
  }

  onSubmitForm() {
    const formData = new FormData();
    formData.append('file', this.selectedFile, this.selectedFile.name);
    formData.append('newWidth', this.newWidth.toString());
    formData.append('newHeight', this.newHeight.toString());

    const url = "https://us-central1-fit2095-2019s2-1.cloudfunctions.net/createThumbnail";
    this.http.post<any>(url, formData, { responseType: 'blob' as 'json' }).subscribe(
      (res) => {
        // Convert image which is in binary form, into a format understandable by the <img> HTML element
        const reader = new FileReader();
        reader.readAsDataURL(res);
        reader.onloadend = () => {
          this.thumbnail = reader.result;
        }
      },
      (err) => {
        this.thumbnail = null;
      }
    );
  }
}
