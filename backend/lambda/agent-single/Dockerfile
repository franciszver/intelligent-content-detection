FROM public.ecr.aws/lambda/python:3.11

ARG HANDLER_DIR=lambda/agent-single
WORKDIR /var/task

# Install Python dependencies into the Lambda task root
COPY ${HANDLER_DIR}/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Copy handler code and shared utilities
COPY ${HANDLER_DIR} .
COPY shared ./shared

CMD ["handler.handler"]


