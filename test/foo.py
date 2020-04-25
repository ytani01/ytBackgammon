#!/usr/bin/env python3
#
#
from flask import Flask, render_template, request
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

app = Flask(__name__)

x = 100

@app.route('/')
def index():
    return render_template('index.html', title="ABC", x=x, y=100)

@app.route('/action', methods=['POST'])
def action():
    global x

    if request.method != 'POST':
        return

    x += 10
    print(x)
    return render_template('index.html', title="ABC", x=x, y=100)


@click.command(context_settings=CONTEXT_SETTINGS)
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def main(debug):
    _log = get_logger(__name__, debug)

    try:
        app.run(host='0.0.0.0', debug=debug)
    finally:
        _log.info('end')

if __name__ == "__main__":
    main()
