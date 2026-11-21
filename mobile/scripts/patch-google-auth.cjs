const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(
  __dirname,
  '../node_modules/@codetrix-studio/capacitor-google-auth/android/src/main/java/com/codetrixstudio/capacitor/GoogleAuth/GoogleAuth.java'
);

if (!fs.existsSync(targetPath)) {
  console.log('[patch-google-auth] GoogleAuth.java not found in node_modules, skipping patch.');
  process.exit(0);
}

const patchedGoogleAuth = `package com.codetrixstudio.capacitor.GoogleAuth;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AccountManagerFuture;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.codetrixstudio.capacitor.GoogleAuth.capacitorgoogleauth.R;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Task;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.android.gms.tasks.OnFailureListener;

@CapacitorPlugin()
public class GoogleAuth extends Plugin {
  private final static String TAG = "GoogleAuth";
  private final static String VERIFY_TOKEN_URL = "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=";
  private final static String FIELD_TOKEN_EXPIRES_IN = "expires_in";
  private final static String FIELD_ACCESS_TOKEN = "accessToken";
  private final static String FIELD_TOKEN_EXPIRES = "expires";

  // see https://developers.google.com/android/reference/com/google/android/gms/auth/api/signin/GoogleSignInStatusCodes#SIGN_IN_CANCELLED
  private final static int SIGN_IN_CANCELLED = 12501;

  public static final int KAssumeStaleTokenSec = 60;

  private GoogleSignInClient googleSignInClient;

  public void loadSignInClient(String clientId, boolean forceCodeForRefreshToken, String[] scopeArray) {
    GoogleSignInOptions.Builder googleSignInBuilder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
      .requestIdToken(clientId)
      .requestEmail();

    if (forceCodeForRefreshToken) {
      googleSignInBuilder.requestServerAuthCode(clientId, true);
    }

    java.util.List<Scope> extraScopes = new java.util.ArrayList<>();
    if (scopeArray != null) {
      for (String s : scopeArray) {
        if (s != null) {
          String trimmed = s.trim();
          if (!trimmed.isEmpty() && 
              !trimmed.equalsIgnoreCase("profile") && 
              !trimmed.equalsIgnoreCase("email") && 
              !trimmed.equalsIgnoreCase("openid")) {
            extraScopes.add(new Scope(trimmed));
          }
        }
      }
    }
    if (!extraScopes.isEmpty()) {
      Scope firstScope = extraScopes.remove(0);
      googleSignInBuilder.requestScopes(firstScope, extraScopes.toArray(new Scope[0]));
    }

    GoogleSignInOptions googleSignInOptions = googleSignInBuilder.build();
    googleSignInClient = GoogleSignIn.getClient(this.getContext(), googleSignInOptions);
  }

  @Override
  public void load() {}

  @PluginMethod()
  public void signIn(PluginCall call) {
    if (googleSignInClient == null) {
      initialize(null);
    }
    Intent signInIntent = googleSignInClient.getSignInIntent();
    startActivityForResult(call, signInIntent, "signInResult");
  }

  @ActivityCallback
  protected void signInResult(PluginCall call, ActivityResult result) {
    if (call == null) return;

    Task<GoogleSignInAccount> completedTask = GoogleSignIn.getSignedInAccountFromIntent(result.getData());

    try {
      GoogleSignInAccount account = completedTask.getResult(ApiException.class);

      // The accessToken is retrieved by executing a network request against the Google API, so it needs to run in a thread
      ExecutorService executor = Executors.newSingleThreadExecutor();
      executor.execute(() -> {
        try {
          JSONObject accessTokenObject = null;
          try {
            accessTokenObject = getAuthToken(account.getAccount(), true);
          } catch (Exception tokenEx) {
            Log.w(TAG, "Notice: could not obtain OAuth access token via legacy AccountManager; continuing with ID token.", tokenEx);
          }

          JSObject authentication = new JSObject();
          authentication.put("idToken", account.getIdToken());
          if (accessTokenObject != null) {
            authentication.put(FIELD_ACCESS_TOKEN, accessTokenObject.opt(FIELD_ACCESS_TOKEN));
            authentication.put(FIELD_TOKEN_EXPIRES, accessTokenObject.opt(FIELD_TOKEN_EXPIRES));
            authentication.put(FIELD_TOKEN_EXPIRES_IN, accessTokenObject.opt(FIELD_TOKEN_EXPIRES_IN));
          } else {
            authentication.put(FIELD_ACCESS_TOKEN, "");
            authentication.put(FIELD_TOKEN_EXPIRES, 0);
            authentication.put(FIELD_TOKEN_EXPIRES_IN, 0);
          }

          JSObject user = new JSObject();
          user.put("serverAuthCode", account.getServerAuthCode());
          user.put("idToken", account.getIdToken());
          user.put("authentication", authentication);

          user.put("name", account.getDisplayName());
          user.put("displayName", account.getDisplayName());
          user.put("email", account.getEmail());
          user.put("familyName", account.getFamilyName());
          user.put("givenName", account.getGivenName());
          user.put("id", account.getId());
          user.put("imageUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);

          call.resolve(user);
        } catch (Exception e) {
          Log.e(TAG, "Error formatting Google sign-in response", e);
          call.reject("Error parsing Google sign-in credentials: " + e.getMessage(), e);
        }
      });
    } catch (ApiException e) {
      Log.e(TAG, "Google Sign-In failed with status code: " + e.getStatusCode() + " - " + e.getMessage(), e);
      if (SIGN_IN_CANCELLED == e.getStatusCode()) {
        call.reject("The user canceled the sign-in flow.", "" + e.getStatusCode());
      } else {
        call.reject("Google Sign-In failed (code " + e.getStatusCode() + "): " + (e.getMessage() != null ? e.getMessage() : "Check SHA-1 or OAuth config"), "" + e.getStatusCode());
      }
    }
  }

  @PluginMethod()
  public void refresh(final PluginCall call) {
    GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(getContext());
    if (account == null) {
      call.reject("User not logged in.");
    } else {
      try {
        JSONObject accessTokenObject = null;
        try {
          accessTokenObject = getAuthToken(account.getAccount(), true);
        } catch (Exception tokenEx) {
          Log.w(TAG, "Notice: could not refresh OAuth access token; continuing with existing idToken.", tokenEx);
        }

        JSObject authentication = new JSObject();
        authentication.put("idToken", account.getIdToken());
        authentication.put(FIELD_ACCESS_TOKEN, accessTokenObject != null ? accessTokenObject.opt(FIELD_ACCESS_TOKEN) : "");
        authentication.put("refreshToken", "");
        call.resolve(authentication);
      } catch(Exception e){
        Log.e(TAG, "Error refreshing credentials", e);
        call.reject("Failed to refresh user credentials: " + e.getMessage(), e);
      }
    }
  }

  @PluginMethod()
  public void signOut(final PluginCall call) {
    if (googleSignInClient == null) {
      initialize(null);
    }
    googleSignInClient.signOut()
      .addOnSuccessListener(getActivity(), new OnSuccessListener<Void>() {
        @Override
          public void onSuccess(Void aVoid) {
            call.resolve();
          }
      })
      .addOnFailureListener(getActivity(), new OnFailureListener() {
        @Override
          public void onFailure(Exception e) {
            call.reject("Sign out failed", e);
          }
      });
  }

  @PluginMethod()
  public void initialize(final PluginCall call) {
    // 1. Resolve Client ID (prefer serverClientId for web-backed OAuth ID token)
    String configClientId = getConfig().getString("serverClientId",
      getConfig().getString("androidClientId",
        getConfig().getString("clientId",
          this.getContext().getString(R.string.server_client_id))));
    boolean configForceCodeForRefreshToken = getConfig().getBoolean("forceCodeForRefreshToken", false);

    String clientId = null;
    if (call != null && call.getData() != null) {
      clientId = call.getData().optString("serverClientId", null);
      if (clientId == null || clientId.trim().isEmpty()) {
        clientId = call.getData().optString("clientId", null);
      }
    }
    if (clientId == null || clientId.trim().isEmpty()) {
      clientId = configClientId;
    }

    boolean forceCodeForRefreshToken = configForceCodeForRefreshToken;
    if (call != null && call.getData() != null) {
      forceCodeForRefreshToken = call.getData().optBoolean("grantOfflineAccess", configForceCodeForRefreshToken);
    }

    // 2. Resolve scopes safely without throwing JSONException on JS arrays
    java.util.List<String> scopeList = new java.util.ArrayList<>();
    if (call != null) {
      try {
        com.getcapacitor.JSArray arr = call.getArray("scopes");
        if (arr != null) {
          for (int i = 0; i < arr.length(); i++) {
            String sc = arr.getString(i);
            if (sc != null && !sc.trim().isEmpty()) scopeList.add(sc.trim());
          }
        }
      } catch (Exception ignored) {}
    }

    if (scopeList.isEmpty()) {
      try {
        String[] cfgArr = getConfig().getArray("scopes");
        if (cfgArr != null) {
          for (String sc : cfgArr) {
            if (sc != null && !sc.trim().isEmpty()) scopeList.add(sc.trim());
          }
        }
      } catch (Exception ignored) {}
    }

    if (scopeList.isEmpty() && call != null && call.getData() != null) {
      try {
        String scopesStr = call.getData().optString("scopes", "");
        if (scopesStr != null && !scopesStr.isEmpty()) {
          String replacedScopesStr = scopesStr.replaceAll("[\\"\\\\[\\\\] ]", "").replace("\\\\", "");
          for (String sc : replacedScopesStr.split(",")) {
            if (sc != null && !sc.trim().isEmpty()) scopeList.add(sc.trim());
          }
        }
      } catch (Exception ignored) {}
    }

    String[] scopeArray = scopeList.toArray(new String[0]);
    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);
    if (call != null) {
      call.resolve();
    }
  }

  // Logic to retrieve accessToken, see https://github.com/EddyVerbruggen/cordova-plugin-googleplus/blob/master/src/android/GooglePlus.java
  private JSONObject getAuthToken(Account account, boolean retry) throws Exception {
    AccountManager manager = AccountManager.get(getContext());
    AccountManagerFuture<Bundle> future = manager.getAuthToken(account, "oauth2:profile email", null, false, null, null);
    Bundle bundle = future.getResult();
    String authToken = bundle.getString(AccountManager.KEY_AUTHTOKEN);
    try {
      return verifyToken(authToken);
    } catch (IOException e) {
      if (retry) {
        manager.invalidateAuthToken("com.google", authToken);
        return getAuthToken(account, false);
      } else {
        throw e;
      }
    }
  }

  private JSONObject verifyToken(String authToken) throws IOException, JSONException {
    URL url = new URL(VERIFY_TOKEN_URL + authToken);
    HttpURLConnection urlConnection = (HttpURLConnection) url.openConnection();
    urlConnection.setInstanceFollowRedirects(true);
    String stringResponse = fromStream(new BufferedInputStream(urlConnection.getInputStream()));

    Log.d("AuthenticatedBackend", "token: " + authToken + ", verification: " + stringResponse);
    JSONObject jsonResponse = new JSONObject(stringResponse);
    int expires_in = jsonResponse.getInt(FIELD_TOKEN_EXPIRES_IN);
    if (expires_in < KAssumeStaleTokenSec) {
      throw new IOException("Auth token soon expiring.");
    }
    jsonResponse.put(FIELD_ACCESS_TOKEN, authToken);
    jsonResponse.put(FIELD_TOKEN_EXPIRES, expires_in + (System.currentTimeMillis() / 1000));
    return jsonResponse;
  }

  private static String fromStream(InputStream is) throws IOException {
    BufferedReader reader = new BufferedReader(new InputStreamReader(is));
    StringBuilder sb = new StringBuilder();
    String line;
    while ((line = reader.readLine()) != null) {
      sb.append(line).append("\\n");
    }
    reader.close();
    return sb.toString();
  }
}
`;

fs.writeFileSync(targetPath, patchedGoogleAuth.trim() + '\n', 'utf8');
console.log('[patch-google-auth] Successfully wrote complete patched GoogleAuth.java');
