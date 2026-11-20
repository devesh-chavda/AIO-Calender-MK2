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

let content = fs.readFileSync(targetPath, 'utf8');

// 1. Patch loadSignInClient to avoid passing invalid empty/default scopes
const oldScopeHandling = `    Scope[] scopes = new Scope[scopeArray.length - 1];
    Scope firstScope = new Scope(scopeArray[0]);
    for (int i = 1; i < scopeArray.length; i++) {
      scopes[i - 1] = new Scope(scopeArray[i]);
    }
    googleSignInBuilder.requestScopes(firstScope, scopes);`;

const newScopeHandling = `    java.util.List<Scope> extraScopes = new java.util.ArrayList<>();
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
    }`;

// 2. Patch initialize to properly extract scopes, serverClientId, and clientId
const oldInitialize = `  @PluginMethod()
  public void initialize(final PluginCall call) {
    // get data from config
    String configClientId = getConfig().getString("androidClientId",
      getConfig().getString("clientId",
        this.getContext().getString(R.string.server_client_id)));
    boolean configForceCodeForRefreshToken = getConfig().getBoolean("forceCodeForRefreshToken", false);
    // need to get this as string so as to standardize with data from plugin call
    String configScopeArray = getConfig().getString("scopes", new String());

    // get client id from plugin call, fallback to be client id from config
    String clientId = call.getData().getString("clientId", configClientId);
    // get forceCodeForRefreshToken from call, fallback to be from config
    boolean forceCodeForRefreshToken = call.getData().getBoolean("grantOfflineAccess", configForceCodeForRefreshToken);
    // get scopes from call, fallback to be from config
    String scopesStr = call.getData().getString("scopes", configScopeArray);
    // replace all the symbols from parsing array as string
    // leaving only scopes delimited by commas
    String replacedScopesStr = scopesStr
      .replaceAll("[\\"\\[\\] ]", "")
      // this is for scopes that are in the form of a url
      .replace("\\\\", "");

    // scope to be in the form of an array
    String[] scopeArray = replacedScopesStr.split(",");

    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);
    call.resolve();
  }`;

const newInitialize = `  @PluginMethod()
  public void initialize(final PluginCall call) {
    // get data from config (prefer serverClientId for web-backed oauth idToken)
    String configClientId = getConfig().getString("serverClientId",
      getConfig().getString("androidClientId",
        getConfig().getString("clientId",
          this.getContext().getString(R.string.server_client_id))));
    boolean configForceCodeForRefreshToken = getConfig().getBoolean("forceCodeForRefreshToken", false);

    // get client id from plugin call, fallback to be client id from config
    String clientId = call.getData().getString("serverClientId",
      call.getData().getString("clientId", configClientId));
    // get forceCodeForRefreshToken from call, fallback to be from config
    boolean forceCodeForRefreshToken = call.getData().getBoolean("grantOfflineAccess", configForceCodeForRefreshToken);

    java.util.List<String> scopeList = new java.util.ArrayList<>();
    try {
      com.getcapacitor.JSArray arr = call.getArray("scopes");
      if (arr != null) {
        for (int i = 0; i < arr.length(); i++) {
          String sc = arr.getString(i);
          if (sc != null && !sc.trim().isEmpty()) scopeList.add(sc.trim());
        }
      }
    } catch (Exception ignored) {}

    if (scopeList.isEmpty()) {
      try {
        com.getcapacitor.JSArray cfgArr = getConfig().getArray("scopes");
        if (cfgArr != null) {
          for (int i = 0; i < cfgArr.length(); i++) {
            String sc = cfgArr.getString(i);
            if (sc != null && !sc.trim().isEmpty()) scopeList.add(sc.trim());
          }
        }
      } catch (Exception ignored) {}
    }

    if (scopeList.isEmpty()) {
      try {
        String scopesStr = call.getData().getString("scopes", getConfig().getString("scopes", ""));
        if (scopesStr != null && !scopesStr.isEmpty()) {
          String replacedScopesStr = scopesStr
            .replaceAll("[\\"\\[\\] ]", "")
            .replace("\\\\", "");
          for (String sc : replacedScopesStr.split(",")) {
            if (sc != null && !sc.trim().isEmpty()) scopeList.add(sc.trim());
          }
        }
      } catch (Exception ignored) {}
    }

    String[] scopeArray = scopeList.toArray(new String[0]);
    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);
    call.resolve();
  }`;

// 3. Patch signInResult to report detailed error and code
const oldSignInResultCatch = `    } catch (ApiException e) {
      if (SIGN_IN_CANCELLED == e.getStatusCode()) {
        call.reject("The user canceled the sign-in flow.", "" + e.getStatusCode());
      } else {
        call.reject("Something went wrong", "" + e.getStatusCode());
      }
    }`;

const newSignInResultCatch = `    } catch (ApiException e) {
      Log.e("GoogleAuth", "Google Sign-In failed with status code: " + e.getStatusCode() + " - " + e.getMessage(), e);
      if (SIGN_IN_CANCELLED == e.getStatusCode()) {
        call.reject("The user canceled the sign-in flow.", "" + e.getStatusCode());
      } else {
        call.reject("Google Sign-In failed (code " + e.getStatusCode() + "): " + (e.getMessage() != null ? e.getMessage() : "Something went wrong"), "" + e.getStatusCode());
      }
    }`;

let patched = false;

if (content.includes(oldScopeHandling)) {
  content = content.replace(oldScopeHandling, newScopeHandling);
  patched = true;
}

if (content.includes(oldInitialize)) {
  content = content.replace(oldInitialize, newInitialize);
  patched = true;
}

if (content.includes(oldSignInResultCatch)) {
  content = content.replace(oldSignInResultCatch, newSignInResultCatch);
  patched = true;
}

if (patched) {
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('[patch-google-auth] Successfully patched GoogleAuth.java');
} else {
  console.log('[patch-google-auth] GoogleAuth.java already patched or target text not found.');
}
