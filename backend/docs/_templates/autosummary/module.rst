{{ fullname | escape | underline }}

{%- if modules %}
.. Package page: render the package docstring and a recursive list of
   submodules. Members are intentionally not re-documented here so that each
   class/function is documented exactly once, on its defining submodule page
   (avoids duplicate object descriptions for re-exported public API).

.. automodule:: {{ fullname }}
   :no-members:

.. rubric:: {{ _('Submodules') }}

.. autosummary::
   :toctree:
   :recursive:
{% for item in modules %}
   {{ item }}
{%- endfor %}

{%- else %}
.. automodule:: {{ fullname }}
   :members:
   :undoc-members:
   :show-inheritance:

   {% block functions %}
   {%- if functions %}
   .. rubric:: {{ _('Functions') }}

   .. autosummary::
   {% for item in functions %}
      {{ item }}
   {%- endfor %}
   {%- endif %}
   {% endblock %}

   {% block classes %}
   {%- if classes %}
   .. rubric:: {{ _('Classes') }}

   .. autosummary::
   {% for item in classes %}
      {{ item }}
   {%- endfor %}
   {%- endif %}
   {% endblock %}

   {% block exceptions %}
   {%- if exceptions %}
   .. rubric:: {{ _('Exceptions') }}

   .. autosummary::
   {% for item in exceptions %}
      {{ item }}
   {%- endfor %}
   {%- endif %}
   {% endblock %}
{%- endif %}
