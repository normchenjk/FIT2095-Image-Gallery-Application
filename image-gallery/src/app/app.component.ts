import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AngularFirestore, DocumentChangeAction, DocumentReference, QuerySnapshot, QueryDocumentSnapshot } from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/storage';
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

  operationMode: string = "create";

  displayProducts: boolean = true;
  products: any[];
  images: any[];

  newProductName: string = "";
  newProductDescription: string = "";
  newProductPrice: number = null;
  newProductStock: number = null;

  newImageUrl: string = "";
  imageFileToCreate: File;

  productIdToUpdate: string = "";
  nameOfProductToUpdate: string = "";
  descriptionOfProductToUpdate: string = "";
  priceOfProductToUpdate: string = "";
  stockOfProductToUpdate: string = "";
  selectedImageIds: string[] = [];

  imageIdToUpdate: string = "";
  imageFileToUpdate: File;
  urlOfImageToUpdate: string = "";

  productIdToDelete: string = "";

  imageIdToDelete: string = "";

  constructor(private http: HttpClient, private database: AngularFirestore, private storage: AngularFireStorage) {
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

  createProduct() {
    this.database.collection("products")
      .add({
        name: this.newProductName,
        description: this.newProductDescription,
        price: this.newProductPrice,
        stock: this.newProductStock,
        images: []
      })
      .catch(error => {
        console.error("Error creating product: ", error);
      });
  }

  async createImage() {
    // We need to ensure that the image ID in Firestore, and the actual image file ID in Storage are the same.
    // We shall be storing thumbnails in a "thumbnails" folder.
    let newImageId = this.database.createId();
    let fileRef = this.storage.ref(`thumbnails/${newImageId}`);
    
    // With await, we make sure the file gets uploaded first before we proceed to obtaining its download URL.
    await fileRef.put(this.imageFileToCreate);

    // The image document in Firestore then gets created with the new URL.
    // The set() function will update an existing document, but will create it if it does not (like upsert in MongoDB).
    fileRef.getDownloadURL().subscribe(downloadUrl => {
      this.database.collection("images").doc(newImageId)
        .set({
          url: downloadUrl,
        })
        .catch(error => {
          console.error("Error creating image: ", error);
        });
    });
  }

  onUploadImageForCreation(files: FileList) {
    this.imageFileToCreate = files[0];
  }

  updateProduct() {
    this.database
      .collection("products")
      .doc(this.productIdToUpdate)
      .update({
        name: this.nameOfProductToUpdate,
        description: this.descriptionOfProductToUpdate,
        price: this.priceOfProductToUpdate,
        stock: this.stockOfProductToUpdate,
        images: this.selectedImageIds.map(imageId => {
          return this.database.collection("images").doc(imageId).ref;
        }) // Convert each of the string IDs provided by the selection box into DocumentReferences.
      })
      .catch(error => {
        console.error("Error updating product: ", error);
      });
  }

  async updateImage() {
    // An update is essentially a delete and a create done together on the same file.
    // We need to wait (using await) to ensure we create only after the delete has finished.
    let fileRef = this.storage.ref(`thumbnails/${this.imageIdToUpdate}`);
    await fileRef.delete().toPromise();
    await fileRef.put(this.imageFileToUpdate);

    fileRef.getDownloadURL().subscribe(downloadUrl => {
      this.database.collection("images").doc(this.imageIdToUpdate)
        .set({
          url: downloadUrl
        })
        .catch(error => {
          console.error("Error updating image: ", error);
        });
    });
  }

  onUploadImageForUpdate(files: FileList) {
    this.imageFileToUpdate = files[0];
  }

  onSelectProductToUpdate() {
    let matchingProducts = this.products.filter(product => {
      return product.id === this.productIdToUpdate;
    }); // The matchingProducts array will contain at most 1 element as product IDs are unique.

    this.nameOfProductToUpdate = matchingProducts[0].name;
    this.descriptionOfProductToUpdate = matchingProducts[0].description;
    this.priceOfProductToUpdate = matchingProducts[0].price;
    this.stockOfProductToUpdate = matchingProducts[0].stock;
    this.selectedImageIds = matchingProducts[0].images.map(image => {
      return image.id;
    }); // Convert each of the DocumentReferences from Firestore into string IDs the selection box can understand.
  }

  onSelectImageToUpdate() {
    let matchingImages = this.images.filter(image => {
      return image.id === this.imageIdToUpdate
    }); // The matchingImages array will contain at most 1 element as image IDs are unique.

    this.urlOfImageToUpdate = matchingImages[0].url;
  }

  deleteProduct() {
    this.database.collection("products")
      .doc(this.productIdToDelete)
      .delete()
      .catch(function (error) {
        console.error("Error deleting product: ", error);
      });
  }

  deleteImage() {
    let imageRef = this.database.collection("images")
      .doc(this.imageIdToDelete)
      .ref;

    // Remove the reference to the image from the product that refers to it.
    this.database.collection("products", ref => ref.where('images', 'array-contains', imageRef))
      .get() // This is the second way to perform GET requests with Firestore, other than with snapshotChanges().
      .subscribe((querySnapshot: QuerySnapshot<any>) => {
        let numProductsToUpdate: number = querySnapshot.size;

        if (numProductsToUpdate === 0) {
          // If we have no affected products, delete the image document right away and return.
          imageRef
            .delete()
            .then(() => {
              let fileRef = this.storage.ref(`thumbnails/${this.imageIdToDelete}`);
              fileRef.delete().toPromise();
            })
            .catch(function (error) {
              console.error("Error deleting image: ", error);
            });

          return;
        }

        // A QuerySnapshot contains QueryDocumentSnapshots from a Firestore query.
        // QueryDocumentSnapshots are similar to DocumentSnapshots.
        querySnapshot.forEach((matchingProduct: QueryDocumentSnapshot<any>) => {
          matchingProduct.ref
            .update({
              images: matchingProduct.data().images.filter((ref: DocumentReference) => {
                return ref.id !== imageRef.id;
              }) // Remove a document's image reference if its ID is the same as the ID of the image being deleted.
            })
            .then(() => {
              numProductsToUpdate--;
              // After we updated all product documents, delete the image.
              if (numProductsToUpdate == 0) {
                imageRef
                  .delete()
                  .then(() => {
                    let fileRef = this.storage.ref(`thumbnails/${this.imageIdToDelete}`);                    
                    fileRef.delete().toPromise();
                  })
                  .catch(function (error) {
                    console.error("Error deleting image: ", error);
                  });
              }
            })
            .catch(error => {
              console.log("Error deleting product image reference: ", error);
            });
        });
      })
  }
}
