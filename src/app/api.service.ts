import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { of } from 'rxjs/observable/of';
import { Subject } from 'rxjs/Subject';
import { catchError, tap, map } from 'rxjs/operators';
import { LOCAL_STORAGE, WebStorageService } from 'angular-webstorage-service';

import { Media } from './media';

import { environment } from '../environments/environment';

// ApiResponse is the format response from the api will take
export class ApiResponse {
  // status represents the success/failure of the request
  success: boolean;
  // message contains info on what whent wrong, or what was done successfully
  message: string;
}

export class RegisterApiResponse extends ApiResponse {}

export class LoginApiResponse extends ApiResponse {
  // auth_token contains a signed authentication token, used for authenticating the user after login
  auth_token: string;
}

export class LogoutApiResponse extends ApiResponse {}

export class AddApiResponse extends ApiResponse {
  // data includes the newly added media element
  data: Media;
}

export class UpdateApiResponse extends ApiResponse {
  // data includes the newly updated media element
  data: Media | Media[];
}

export class DeleteApiResponse extends ApiResponse {}

export class GetApiResponse extends ApiResponse {
  // data includes the list of media elements gotten
  data: Media[];
}

//const apiUrl = 'https://gogomedia-backend.herokuapp.com';
const apiUrl = environment.apiUrl;

@Injectable()
export class ApiService {
  private currentUser;
  private authToken;

  // mediaUpdates keeps track of the current state of media elements for this user
  // when media elements are added/deleted/updated mediaUpdates publishes the new list of
  // media elements
  mediaUpdates = new Subject<Media[]>();
  currentMediaList: Media[];

  constructor(
    private http: HttpClient,
    @Inject(LOCAL_STORAGE) private storage: WebStorageService
  ) {
    if (this.loggedIn()) {
      this.currentUser = this.storage.get('user');
      this.authToken = this.storage.get('jwt');
    } else {
      this.currentUser = '';
      this.authToken = '';
    }
  }

  /*
  register takes a username and password and registeres a new user with the API
  @return: an observable with a type string that will be 'success' or an error message
   */
  register(username: string, password: string): Observable<string> {
    // TODO hash this password
    const url = `${apiUrl}/register`;
    const body = {
      'username': username,
      'password': password
    };
    const options = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    return this.http.post(url, body, options)
      .pipe(
        map((response: RegisterApiResponse) => {
          console.log(`user: ${username} was successfully registered`);
          return 'success';
        }),
        catchError(this.handleError(`register`))
      );
  }

  /*
  loggedIn checks if there is a jwt token and user in local storage, if there is then there is
  a user logged in
   */
  loggedIn(): boolean {
    return this.storage.get('jwt') !== null && this.storage.get('user') !== null;
  }

  /*
  login takes a username and password and logs in the user with the API
  @return: an observable with a type string that will be 'success' or an error message
   */
  login(username: string, password: string): Observable<string> {
    // TODO hash this password
    const url = `${apiUrl}/login`;
    const body = {
      'username': username,
      'password': password
    };
    const options = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    return this.http.post(url, body, options)
      .pipe(
        map((response: LoginApiResponse) => {
          console.log(`user: ${username} was successfully logged in`);

          this.storage.set('jwt', response.auth_token);
          this.storage.set('user', username);
          this.currentUser = username;
          this.authToken = response.auth_token;

          this.getMedia().subscribe();

          return 'success';
        }),
        catchError(this.handleError(`login`, () => {
          this.storage.remove('jwt');
          this.storage.remove('user');
          this.currentUser = '';
          this.authToken = '';
        }))
      );
  }

  /*
  logout logs the current user out with the API
  @return: an observable with a type string that will be 'success' or an error message
   */
  logout(): Observable<string> {
    if (!this.loggedIn()) {
      return of('not logged in');
    }

    const url = `${apiUrl}/logout`;
    const options = {
      headers: new HttpHeaders({
        'Authorization': `JWT ${this.authToken}`
      })
    }

    return this.http.get(url, options)
      .pipe(
        map((response: LogoutApiResponse) => {
          console.log(`user: ${this.currentUser} was successfully logged out`);

          this.storage.remove('jwt');
          this.storage.remove('user');
          this.currentUser = '';
          this.authToken = '';

          return 'success';
        }),
        catchError(this.handleError(`logout`, () => {
          this.storage.remove('jwt');
          this.storage.remove('user');
          this.currentUser = '';
          this.authToken = '';
        }))
      );
  }

  /*
  addMedia takes a media object and adds it for the current user with the API
  @return: an observable with a type Media if successful or type string that will be an error message
   */
  addMedia(media: Media): Observable<Media | string> {
    const url = `${apiUrl}/user/${this.currentUser}/media`;
    const body = media;
    const options = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `JWT ${this.authToken}`
      })
    };

    return this.http.put(url, body, options)
      .pipe(
        map((response: AddApiResponse) => {
          console.log(`media: ${response.data.name} was successfully added`);

          this.currentMediaList.unshift(response.data);
          this.mediaUpdates.next(this.currentMediaList);

          return response.data;
        }),
        catchError(this.handleError(`addMedia`))
      );
  }

  updateMedia(media: Media | Media[]): Observable<Media | Media[] | string> {
    const url = `${apiUrl}/user/${this.currentUser}/media`;
    const body = media;
    const options = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `JWT ${this.authToken}`
      })
    };

    return this.http.put(url, body, options)
      .pipe(
        map((response: UpdateApiResponse) => {

          if (response.data instanceof Media) {
            // if the response is a single Media element
            console.log(`media: ${response.data.name} was successfully updated`);

            let responseMedia = <Media>response.data;

            this.currentMediaList = this.currentMediaList.map((mediaElement: Media) => {
              if (mediaElement.id === responseMedia.id) {
                mediaElement = responseMedia;
              }

              return mediaElement;
            });
          } else {
            // if the response is a list of Media elements
            console.log(`media list was successfully updated`);

            let responseMedia = <Media[]>response.data;

            for (var newMedia of responseMedia) {
              this.currentMediaList = this.currentMediaList.map((mediaElement: Media) => {
                if (mediaElement.id === newMedia.id) {
                  mediaElement = newMedia;
                }

                return mediaElement;
              });
            }
          }

          this.mediaUpdates.next(this.currentMediaList);

          return response.data;
        }),
        catchError(this.handleError(`updateMedia`))
      );
  }

  getMedia(): Observable<Media[] | string> {
    const url = `${apiUrl}/user/${this.currentUser}/media`;
    const options = {
      headers: new HttpHeaders({
        'Authorization': `JWT ${this.authToken}`
      })
    };

    return this.http.get(url, options)
      .pipe(
        map((response: GetApiResponse) => {
          console.log(`list of media was successfully gotten`);

          this.currentMediaList = response.data;
          this.mediaUpdates.next(this.currentMediaList);

          return response.data;
        }),
        catchError(this.handleError(`getMedia`))
      );
  }

  deleteMedia(media: Media): Observable<string> {
    const url = `${apiUrl}/user/${this.currentUser}/media`;
    const options = {
      body: media,
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `JWT ${this.authToken}`
      })
    };

    // HttpClient delete method doesn't allow for a body, so a generic request is created
    return this.http.request('delete', url, options)
      .pipe(
        map((response: DeleteApiResponse) => {
          console.log(`media: ${media.name} was deleted successfully`);

          this.currentMediaList = this.currentMediaList.filter((mediaElement: Media) => {
            return mediaElement.id !== media.id;
          });
          this.mediaUpdates.next(this.currentMediaList);

          return 'success';
        }),
        catchError(this.handleError(`deleteMedia`))
      );
  }

  private handleError(operation='operation', callback?: () => void) {
    return (error: any): Observable<string> => {
      if (callback) callback();
      console.error(`${operation} failed with error: ${error.error.message}`);
      if (error.status == 401) {
        // If the user's auth token is invalid for some reason, log the user out
        // TODO if the user tries to access another user's data, it'll log them out, is that good behavior?
        this.storage.remove('jwt');
        this.storage.remove('user');
        this.currentUser = '';
        this.authToken = '';
      }

      return of(error.error.message);
    };
  }
}
