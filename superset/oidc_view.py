from flask import request, redirect
from flask_appbuilder import expose
from flask_appbuilder.security.views import AuthOIDView
from flask_login import login_user
from urllib import parse


class AuthOIDCView(AuthOIDView):

    @expose('/login/', methods=['GET', 'POST'])
    def login(self, flag=True):
        sm = self.appbuilder.sm
        oidc = sm.oid

        @self.appbuilder.sm.oid.require_login
        def handle_login():
            user = sm.auth_user_oid(oidc.user_getfield('email'))

            if user is None:
                user = sm.add_user(oidc.user_getfield('email').split("@")[0], '', '',
                                   oidc.user_getfield('email'), sm.find_role('Gamma'))

            login_user(user, remember=False)
            return redirect(self.appbuilder.get_url_for_index)

        return handle_login()

    @expose('/logout/', methods=['GET', 'POST'])
    def logout(self):
        oidc = self.appbuilder.sm.oid

        oidc.logout()
        super(AuthOIDCView, self).logout()
        redirect_url = request.url_root.strip('/') + self.appbuilder.get_url_for_login

        return redirect(
            oidc.client_secrets.get('issuer') + '/protocol/openid-connect/logout?redirect_uri=' + parse.quote(redirect_url))
