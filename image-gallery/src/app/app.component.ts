import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AngularFirestore, DocumentChangeAction, DocumentReference, QuerySnapshot, QueryDocumentSnapshot } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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

  displayProducts: boolean = true;
  products: any[];
  images: any[];

  constructor(private http: HttpClient, private database: AngularFirestore) {
    this.getAllProducts();
    this.getAllImages();
  }

  /* onSelectFile() AND onSubmitForm() CODE FROM PREVIOUS INTEGRATING GOOGLE CLOUD FUNCTIONS INTO AN ANGULAR APPLICATION SECTION GOES HERE. */
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

  getAllProducts() {
    this.getCollectionObservable("products")
      .subscribe((products: any[]) => {
        this.products = products;

        // Note that in the Products collection, we defined the images attribute of a product as an array of references to image documents.
        // We need to resolve those image references in order to get the URL and ID of each image. Lets call these images as resolvedImages.
        // I.e. myProduct.images: [DocumentReference(), DocumentReference()], myProduct.resolvedImages: [Promise<{id, url}>, Promise<{id, url}>]
        // To resolve each image reference, we need to query the database and this will be an asynchronous operation.
        // We can get the value once it is ready by using Promises.
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
        // https://codeburst.io/javascript-map-vs-foreach-f38111822c0f
        this.products = products.map(product => {
          // Iterate through each image reference of the current product document.
          // A DocumentReference is simply a reference to a Firestore document.
          product.resolvedImages = product.images.map(async (image: DocumentReference) => {
            // Calling get() on a DocumentReference returns a promise for a DocumentSnapshot.
            // A DocumentSnapshot contains data read from a Firestore document.
            // Currently, if we have n images, we make n HTTP requests.
            // If we do this in production environments, we will very quickly exceed Firestore free usage quotas. Can you think of a better way?
            const documentSnapshot = await image.get();

            return {
              id: documentSnapshot.id,
              url: documentSnapshot.data().url
            }
          });
          return product;
        });
      });
  }

  getAllImages() {
    this.getCollectionObservable("images")
      .subscribe((images: any[]) => {
        this.images = images;
      });
  }

  // Helper function to promote code reuse.
  getCollectionObservable(collectionName: string): Observable<any> {
    // When documents are loaded, changes are made to the internal state of our local Firestore database (in this case, "added").
    // These change actions are represented as DocumentChangeAction objects and contain info about what data has been added for a document.
    // Includes information like document ID, DocumentReferences to other documents and other important metadata.
    // Using snapshotChanges() allows us to subscribe to real-time updates of our data. With get(), data does not update once we have fetched them.
    return this.database
      .collection(collectionName)
      .snapshotChanges()
      .pipe(
        map((actions: DocumentChangeAction<any>[]) => actions.map(action => {
          const id = action.payload.doc.id;
          const data = action.payload.doc.data();
          return { id, ...data };
        }))
      );
  }

  onToggle() {
    this.displayProducts = !this.displayProducts;
  }
}
